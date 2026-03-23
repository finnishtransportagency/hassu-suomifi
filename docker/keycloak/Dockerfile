FROM quay.io/keycloak/keycloak:26.5.3

# Realm importilla ei vaikuta olemassa oleviin ympäristöihin
# https://www.keycloak.org/server/importExport#_importing_a_realm_during_startup
COPY ./conf/keycloak/suomifi-realm-export.json /opt/keycloak/data/import/

ENV KC_HEALTH_ENABLED=true

ENV TZ=Europe/Helsinki

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
# Override in local env with e.g. CMD ["start-dev"]
CMD ["start"]
