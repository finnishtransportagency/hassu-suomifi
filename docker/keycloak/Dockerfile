FROM quay.io/keycloak/keycloak:26.6.3

# Build-time optiot: docker run --rm quay.io/keycloak/keycloak:x.y.z build --help-all
# (Runtime optiot: docker run --rm quay.io/keycloak/keycloak:x.y.z start --help-all)
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_HTTP_RELATIVE_PATH=/keycloak/auth
ENV KC_HTTP_MANAGEMENT_RELATIVE_PATH=/
ENV TZ=Europe/Helsinki

# Realm importilla ei vaikutusta olemassa oleviin ympäristöihin
# https://www.keycloak.org/server/importExport#_importing_a_realm_during_startup
COPY ./conf/keycloak/suomifi-realm-export.json /opt/keycloak/data/import/

RUN /opt/keycloak/bin/kc.sh build

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
