package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"aditi-stays/core-api/internal/auth"
	"aditi-stays/core-api/internal/config"
	"aditi-stays/core-api/internal/middleware"
	"aditi-stays/core-api/internal/models"
	"aditi-stays/core-api/internal/repository"
	"aditi-stays/core-api/internal/service"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	svc            *service.Service
	repo           *repository.Repository
	cfg            *config.Config
	sessionManager *auth.Manager
}

func New(svc *service.Service, repo *repository.Repository, cfg *config.Config, sessionManager *auth.Manager) *Handler {
	return &Handler{svc: svc, repo: repo, cfg: cfg, sessionManager: sessionManager}
}

func (h *Handler) RegisterRoutes(r *gin.Engine, adminAuth gin.HandlerFunc, leadLimiter gin.HandlerFunc) {
	r.GET("/health", h.health)

	api := r.Group("/api")
	api.GET("/properties", h.listProperties)
	api.GET("/properties/feedback-summary", h.getPropertyFeedbackSummary)
	api.GET("/properties/:id", h.getProperty)
	api.GET("/properties/:id/feedback", h.getPropertyReviews)
	api.POST("/properties/:id/feedback", h.addPropertyFeedback)
	api.GET("/banners", h.listBanners)

	api.POST("/browsing-history", h.trackBrowsing)
	api.GET("/browsing-history/:visitorId", h.getBrowsing)

	api.POST("/wishlist/items", h.addWishlistItem)
	api.DELETE("/wishlist/items", h.removeWishlistItem)
	api.GET("/wishlist/:visitorId", h.getWishlist)

	api.POST("/comparisons", h.compareProperties)

	api.POST("/leads/check-availability", leadLimiter, h.checkAvailability)

	api.POST("/admin/session/login", h.loginAdmin)

	session := api.Group("/admin/session")
	session.Use(adminAuth)
	session.GET("", h.getAdminSession)
	session.POST("/logout", h.logoutAdmin)

	admin := api.Group("/admin")
	admin.Use(adminAuth)
	admin.GET("/leads/active", h.listActiveLeads)
	admin.GET("/leads/all", h.listAllLeads)
	admin.GET("/leads/:leadId", h.getLead)
	admin.GET("/leads/:leadId/context", h.getLeadContext)
	admin.GET("/leads/:leadId/messages", h.getLeadMessages)
	admin.POST("/leads/:leadId/inventory-check", h.updateInventory)
	admin.POST("/leads/:leadId/payment", h.addPayment)
	admin.DELETE("/leads/:leadId/payment/:paymentId", h.deletePayment)
	admin.POST("/leads/:leadId/confirm", h.confirmLead)
	admin.GET("/payments", h.listPayments)
	admin.GET("/settings/gpay", h.getGpaySettings)
	admin.PUT("/settings/gpay", h.updateGpaySettings)
	admin.GET("/analytics/daily", h.dailyAnalytics)
	admin.GET("/analytics/summary", h.summaryAnalytics)
	admin.GET("/banners", h.listBannersAdmin)
	admin.POST("/banners", h.addBanner)
	admin.PUT("/banners/:bannerId", h.updateBanner)
	admin.DELETE("/banners/:bannerId", h.deleteBanner)
	admin.GET("/properties", h.listPropertiesAdmin)
	admin.POST("/properties", h.addProperty)
	admin.PUT("/properties/:id", h.updateProperty)
	admin.DELETE("/properties/:id", h.deleteProperty)
}

func (h *Handler) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) loginAdmin(c *gin.Context) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.ToLower(strings.TrimSpace(in.Email))
	password := in.Password
	if email == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email and password are required"})
		return
	}
	if email != strings.ToLower(h.cfg.AdminLoginEmail) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(h.cfg.AdminLoginPasswordHash), []byte(password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, claims, err := h.sessionManager.IssueAdminSession(email, h.cfg.AdminLoginDisplayName, time.Duration(h.cfg.AdminSessionTTLHours)*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create admin session"})
		return
	}

	http.SetCookie(c.Writer, h.adminSessionCookie(token, claims.ExpiresAt))
	c.JSON(http.StatusOK, gin.H{"data": h.sessionResponse(claims)})
}

func (h *Handler) getAdminSession(c *gin.Context) {
	email, _ := c.Get(middleware.ContextAdminEmail)
	actor, _ := c.Get(middleware.ContextAdminActor)
	role, _ := c.Get(middleware.ContextAdminRole)

	sessionToken, err := c.Cookie(h.cfg.AdminSessionCookieName)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "admin authentication required"})
		return
	}
	claims, err := h.sessionManager.Verify(sessionToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "admin session is invalid"})
		return
	}

	if s, ok := email.(string); ok && s != "" {
		claims.Email = s
	}
	if s, ok := actor.(string); ok && s != "" {
		claims.Actor = s
	}
	if s, ok := role.(string); ok && s != "" {
		claims.Role = s
	}
	c.JSON(http.StatusOK, gin.H{"data": h.sessionResponse(claims)})
}

func (h *Handler) logoutAdmin(c *gin.Context) {
	http.SetCookie(c.Writer, h.expiredAdminSessionCookie())
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) sessionResponse(claims *auth.Claims) gin.H {
	return gin.H{
		"email":      claims.Email,
		"actor":      claims.Actor,
		"role":       claims.Role,
		"expires_at": time.Unix(claims.ExpiresAt, 0).UTC().Format(time.RFC3339),
	}
}

func (h *Handler) adminSessionCookie(token string, expiresAt int64) *http.Cookie {
	return &http.Cookie{
		Name:     h.cfg.AdminSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.AdminSessionSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(expiresAt, 0).UTC(),
		MaxAge:   int(time.Until(time.Unix(expiresAt, 0).UTC()).Seconds()),
	}
}

func (h *Handler) expiredAdminSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     h.cfg.AdminSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cfg.AdminSessionSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0).UTC(),
		MaxAge:   -1,
	}
}

func (h *Handler) listProperties(c *gin.Context) {
	props, err := h.svc.ListProperties(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": props})
}

func (h *Handler) getProperty(c *gin.Context) {
	prop, err := h.svc.GetPropertyByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		status := http.StatusInternalServerError
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": prop})
}

func (h *Handler) addPropertyFeedback(c *gin.Context) {
	propertyID := c.Param("id")
	if propertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "property id is required"})
		return
	}

	var in struct {
		VisitorID string `json:"visitor_id"`
		Rating    int    `json:"rating"`
		Comment   string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.VisitorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "visitor_id is required"})
		return
	}
	if in.Rating < 1 || in.Rating > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rating must be between 1 and 5"})
		return
	}

	row, err := h.repo.AddPropertyFeedback(c.Request.Context(), propertyID, in.VisitorID, in.Rating, in.Comment)
	if err != nil {
		status := http.StatusInternalServerError
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		} else if strings.Contains(strings.ToLower(err.Error()), "already submitted") {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": row})
}

func (h *Handler) getPropertyFeedbackSummary(c *gin.Context) {
	rows, err := h.repo.GetPropertyFeedbackSummary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) getPropertyReviews(c *gin.Context) {
	propertyID := c.Param("id")
	summary, err := h.repo.GetPropertyFeedbackSummaryByID(c.Request.Context(), propertyID)
	if err != nil {
		status := http.StatusInternalServerError
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	reviews, err := h.repo.ListPropertyReviews(c.Request.Context(), propertyID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": reviews, "summary": summary})
}

func (h *Handler) listBanners(c *gin.Context) {
	rows, err := h.repo.ListActiveBanners(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) listBannersAdmin(c *gin.Context) {
	rows, err := h.repo.ListActiveBanners(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "list_banners", "banner", "*", map[string]any{"count": len(rows)})
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) addBanner(c *gin.Context) {
	var in struct {
		Title    string         `json:"title"`
		URL      string         `json:"url"`
		Platform string         `json:"platform"`
		CoverURL string         `json:"cover_url"`
		Metadata map[string]any `json:"metadata"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.repo.AddBanner(c.Request.Context(), in.Title, in.URL, in.Platform, in.CoverURL, in.Metadata)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "add_banner", "banner", strconv.FormatInt(row.ID, 10), map[string]any{"title": row.Title, "url": row.URL})
	c.JSON(http.StatusCreated, gin.H{"data": row})
}

func (h *Handler) deleteBanner(c *gin.Context) {
	bannerID, err := strconv.ParseInt(c.Param("bannerId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid banner id"})
		return
	}
	if err := h.repo.DeleteBanner(c.Request.Context(), bannerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "delete_banner", "banner", strconv.FormatInt(bannerID, 10), nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) updateBanner(c *gin.Context) {
	bannerID, err := strconv.ParseInt(c.Param("bannerId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid banner id"})
		return
	}

	var in struct {
		Title    string         `json:"title"`
		URL      string         `json:"url"`
		Platform string         `json:"platform"`
		CoverURL string         `json:"cover_url"`
		Metadata map[string]any `json:"metadata"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.repo.UpdateBanner(c.Request.Context(), bannerID, in.Title, in.URL, in.Platform, in.CoverURL, in.Metadata)
	if err != nil {
		status := http.StatusBadRequest
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "update_banner", "banner", strconv.FormatInt(row.ID, 10), map[string]any{"title": row.Title, "url": row.URL})
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *Handler) listPropertiesAdmin(c *gin.Context) {
	rows, err := h.repo.ListAdminProperties(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "list_admin_properties", "property", "*", map[string]any{"count": len(rows)})
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *Handler) addProperty(c *gin.Context) {
	var in struct {
		ID             string   `json:"id"`
		Location       string   `json:"location"`
		NightlyPrice   float64  `json:"nightly_price"`
		FamilyFriendly bool     `json:"family_friendly"`
		Amenities      []string `json:"amenities"`
		HeroImage      string   `json:"hero_image"`
		Media          []string `json:"media"`
		Description    string   `json:"description"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.svc.CreateProperty(c.Request.Context(), models.PropertyCreateInput{
		ID:             in.ID,
		Location:       in.Location,
		NightlyPrice:   in.NightlyPrice,
		FamilyFriendly: in.FamilyFriendly,
		Amenities:      in.Amenities,
		HeroImage:      in.HeroImage,
		Media:          in.Media,
		Description:    in.Description,
	})
	if err != nil {
		status := http.StatusBadRequest
		if repository.IsDuplicate(err) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "add_property", "property", row.ID, map[string]any{
		"location":      row.Location,
		"nightly_price": row.NightlyPrice,
	})
	c.JSON(http.StatusCreated, gin.H{"data": row})
}

func (h *Handler) updateProperty(c *gin.Context) {
	propertyID := strings.TrimSpace(c.Param("id"))
	if propertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "property id is required"})
		return
	}

	var in struct {
		Location       string   `json:"location"`
		NightlyPrice   float64  `json:"nightly_price"`
		FamilyFriendly bool     `json:"family_friendly"`
		Amenities      []string `json:"amenities"`
		HeroImage      string   `json:"hero_image"`
		Media          []string `json:"media"`
		Description    string   `json:"description"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.svc.UpdateProperty(c.Request.Context(), propertyID, models.PropertyCreateInput{
		ID:             propertyID,
		Location:       in.Location,
		NightlyPrice:   in.NightlyPrice,
		FamilyFriendly: in.FamilyFriendly,
		Amenities:      in.Amenities,
		HeroImage:      in.HeroImage,
		Media:          in.Media,
		Description:    in.Description,
	})
	if err != nil {
		status := http.StatusBadRequest
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	h.auditAdminAction(c, "update_property", "property", row.ID, map[string]any{
		"location":      row.Location,
		"nightly_price": row.NightlyPrice,
	})
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func (h *Handler) deleteProperty(c *gin.Context) {
	propertyID := strings.TrimSpace(c.Param("id"))
	if propertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "property id is required"})
		return
	}
	if err := h.repo.DeactivateProperty(c.Request.Context(), propertyID); err != nil {
		status := http.StatusInternalServerError
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "deactivate_property", "property", propertyID, nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) trackBrowsing(c *gin.Context) {
	var in struct {
		VisitorID  string `json:"visitor_id"`
		PropertyID string `json:"property_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.VisitorID == "" || in.PropertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "visitor_id and property_id are required"})
		return
	}
	if err := h.repo.AddBrowsingHistory(c.Request.Context(), in.VisitorID, in.PropertyID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true})
}

func (h *Handler) getBrowsing(c *gin.Context) {
	items, err := h.repo.GetBrowsingHistory(c.Request.Context(), c.Param("visitorId"), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) addWishlistItem(c *gin.Context) {
	var in struct {
		VisitorID  string `json:"visitor_id"`
		PropertyID string `json:"property_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.VisitorID == "" || in.PropertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "visitor_id and property_id are required"})
		return
	}
	if err := h.repo.AddWishlistItem(c.Request.Context(), in.VisitorID, in.PropertyID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true})
}

func (h *Handler) removeWishlistItem(c *gin.Context) {
	visitorID := c.Query("visitor_id")
	propertyID := c.Query("property_id")
	if visitorID == "" || propertyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "visitor_id and property_id are required query params"})
		return
	}
	if err := h.repo.RemoveWishlistItem(c.Request.Context(), visitorID, propertyID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) getWishlist(c *gin.Context) {
	items, err := h.repo.GetWishlist(c.Request.Context(), c.Param("visitorId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) compareProperties(c *gin.Context) {
	var in struct {
		PropertyIDs []string `json:"property_ids"`
		VisitorID   string   `json:"visitor_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	props, err := h.svc.CompareProperties(c.Request.Context(), in.PropertyIDs, in.VisitorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": props})
}

func (h *Handler) checkAvailability(c *gin.Context) {
	var in struct {
		VisitorID          string `json:"visitor_id"`
		PropertyID         string `json:"property_id"`
		CustomerName       string `json:"customer_name"`
		MobileNumber       string `json:"mobile_number"`
		DisclaimerAccepted bool   `json:"disclaimer_accepted"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	lead, resumed, err := h.svc.CreateOrReuseLead(c.Request.Context(), in.VisitorID, in.PropertyID, in.CustomerName, in.MobileNumber, in.DisclaimerAccepted)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	chatToken, err := h.svc.GenerateUserChatToken(lead.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unable to create chat token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data":             lead,
		"resumed_chat":     resumed,
		"chat_id":          lead.ID,
		"chat_token":       chatToken,
		"notice":           "Chat will be recorded for internal training purposes & compliance.",
		"recording_notice": "Chat will be recorded for internal training purposes & compliance.",
	})
}

func (h *Handler) getLead(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	lead, err := h.repo.GetLeadByID(c.Request.Context(), leadID)
	if err != nil {
		status := http.StatusInternalServerError
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": lead})
}

func (h *Handler) getLeadMessages(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	msgs, err := h.repo.GetLeadMessages(c.Request.Context(), leadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

func (h *Handler) listActiveLeads(c *gin.Context) {
	leads, err := h.repo.ListActiveLeads(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "list_active_leads", "lead", "*", map[string]any{"count": len(leads)})
	c.JSON(http.StatusOK, gin.H{"data": leads})
}

func (h *Handler) listAllLeads(c *gin.Context) {
	limitRaw := c.DefaultQuery("limit", "200")
	limit, err := strconv.Atoi(limitRaw)
	if err != nil {
		limit = 200
	}
	leads, err := h.repo.ListLeads(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "list_all_leads", "lead", "*", map[string]any{"count": len(leads)})
	c.JSON(http.StatusOK, gin.H{"data": leads})
}

func (h *Handler) getLeadContext(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	contextData, err := h.repo.LeadContext(c.Request.Context(), leadID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "view_lead_context", "lead", strconv.FormatInt(leadID, 10), nil)
	c.JSON(http.StatusOK, gin.H{"data": contextData})
}

func (h *Handler) updateInventory(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	var in struct {
		Available bool   `json:"available"`
		Note      string `json:"note"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.UpdateInventoryStatus(c.Request.Context(), leadID, in.Available, in.Note); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "inventory_check", "lead", strconv.FormatInt(leadID, 10), map[string]any{"available": in.Available, "note": in.Note})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) addPayment(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	var in struct {
		Amount      float64 `json:"amount"`
		PaymentType string  `json:"payment_type"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payment, err := h.svc.AddPayment(c.Request.Context(), leadID, in.Amount, in.PaymentType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "add_payment", "lead", strconv.FormatInt(leadID, 10), map[string]any{"amount": in.Amount, "payment_type": in.PaymentType})
	c.JSON(http.StatusCreated, gin.H{"data": payment})
}

func (h *Handler) deletePayment(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	paymentID, err := strconv.ParseInt(c.Param("paymentId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payment id"})
		return
	}
	payment, nextStatus, err := h.svc.DeletePayment(c.Request.Context(), leadID, paymentID)
	if err != nil {
		status := http.StatusBadRequest
		if repository.IsNotFound(err) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "delete_payment", "lead", strconv.FormatInt(leadID, 10), map[string]any{
		"payment_id":   paymentID,
		"amount":       payment.Amount,
		"payment_type": payment.PaymentType,
		"next_status":  nextStatus,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": payment, "lead_status": nextStatus})
}

func (h *Handler) listPayments(c *gin.Context) {
	limitRaw := c.DefaultQuery("limit", "200")
	limit, err := strconv.Atoi(limitRaw)
	if err != nil {
		limit = 200
	}
	items, err := h.repo.ListPayments(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "list_payments", "payment", "*", map[string]any{"count": len(items)})
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (h *Handler) getGpaySettings(c *gin.Context) {
	settings, err := h.repo.GetPlatformSetting(c.Request.Context(), "gpay")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "view_gpay_settings", "settings", "gpay", nil)
	c.JSON(http.StatusOK, gin.H{"data": settings})
}

func (h *Handler) updateGpaySettings(c *gin.Context) {
	var in struct {
		QRURL        string `json:"qr_url"`
		MobileNumber string `json:"mobile_number"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload := map[string]any{
		"qr_url":        strings.TrimSpace(in.QRURL),
		"mobile_number": strings.TrimSpace(in.MobileNumber),
	}
	if err := h.repo.UpsertPlatformSetting(c.Request.Context(), "gpay", payload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "update_gpay_settings", "settings", "gpay", payload)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": payload})
}

func (h *Handler) confirmLead(c *gin.Context) {
	leadID, err := strconv.ParseInt(c.Param("leadId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lead id"})
		return
	}
	var in struct {
		Details string `json:"details"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.ConfirmLead(c.Request.Context(), leadID, in.Details); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "confirm_lead", "lead", strconv.FormatInt(leadID, 10), map[string]any{"details": in.Details})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) dailyAnalytics(c *gin.Context) {
	day := c.Query("date")
	if day == "" {
		day = time.Now().Format("2006-01-02")
	}
	data, err := h.repo.DailyAnalytics(c.Request.Context(), day)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "view_daily_analytics", "analytics", day, nil)
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) summaryAnalytics(c *gin.Context) {
	data, err := h.repo.SummaryAnalytics(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditAdminAction(c, "view_summary_analytics", "analytics", "summary", nil)
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) auditAdminAction(c *gin.Context, action, resourceType, resourceID string, payload map[string]any) {
	actor := "admin"
	if v, ok := c.Get(middleware.ContextAdminActor); ok {
		if s, ok := v.(string); ok && s != "" {
			actor = s
		}
	}
	requestID := c.GetString(middleware.ContextRequestID)
	if err := h.repo.CreateAuditLog(
		c.Request.Context(),
		actor,
		"admin",
		action,
		resourceType,
		resourceID,
		requestID,
		c.ClientIP(),
		c.Request.UserAgent(),
		payload,
	); err != nil {
		fmt.Printf("audit log failed: %v\n", err)
	}
}
