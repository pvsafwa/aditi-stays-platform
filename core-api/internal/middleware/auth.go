package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	ContextRequestID  = "request_id"
	ContextAdminActor = "admin_actor"
	ContextAdminRole  = "admin_role"
)

func AdminAuth(requiredToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		parts := strings.SplitN(strings.TrimSpace(authHeader), " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing admin bearer token"})
			return
		}
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
	}
}
