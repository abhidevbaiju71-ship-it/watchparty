FROM nginxinc/nginx-unprivileged:1.25-alpine

USER root

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy the static web app files to nginx html directory
COPY --chown=nginx:nginx index.html style.css app.js ludo.html ludo.css ludo.js /usr/share/nginx/html/

USER nginx

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:${PORT:-8080}/ || exit 1

# Railway passes the $PORT environment variable to the container.
# We replace the default port 8080 with the Railway PORT dynamically before starting Nginx.
CMD sh -c 'if [ -z "$PORT" ]; then PORT=8080; fi; \
    sed -i "s/listen.*8080;/listen $PORT;/g" /etc/nginx/conf.d/default.conf && \
    nginx -g "daemon off;"'
