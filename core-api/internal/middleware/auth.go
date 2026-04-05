package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"aditi-stays/core-api/internal/auth"
	"github.com/gin-gonic/gin"
)

const (
	ContextRequestID  = "request_id"
	ContextAdminActor = "admin_actor"
	ContextAdminRole  = "admin_role"
	ContextAdminEmail = "admin_email"
)

func AdminAuth(requiredToken string, sessionCookieName string, sessionManager *auth.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			token := strings.TrimSpace(parts[1])
			if subtle.ConstantTimeCompare([]byte(token), []byte(requiredToken)) != 1 {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid admin token"})
				return
			}
			actor := strings.TrimSpace(c.GetHeader("X-Admin-Actor"))
			if actor == "" {
				actor = "admin"
			}
			c.Set(ContextAdminActor, actor)
			c.Set(ContextAdminRole, "admin")
			c.Next()
			return
		}

		sessionToken, err := c.Cookie(sessionCookieName)
		if err != nil || strings.TrimSpace(sessionToken) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "admin authentication required"})
			return
		}
		claims, err := sessionManager.Verify(strings.TrimSpace(sessionToken))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "admin session is invalid"})
			return
		}

		c.Set(ContextAdminActor, claims.Actor)
		c.Set(ContextAdminRole, claims.Role)
		c.Set(ContextAdminEmail, claims.Email)
		c.Next()
	}
}
