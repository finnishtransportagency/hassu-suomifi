FROM jboss/keycloak

COPY ./lib/postgresql-42.2.24.jar /opt/jboss/keycloak/modules/system/layers/keycloak/org/postgresql/main/
COPY ./conf/jboss/postgresql/module.xml /opt/jboss/keycloak/modules/system/layers/keycloak/org/postgresql/main/
#COPY ./conf/jboss/standalone.xml /opt/jboss/keycloak/standalone/configuration/
#COPY ./conf/jboss/standalone-ha.xml /opt/jboss/keycloak/standalone/configuration/
#COPY custom-scripts/ /opt/jboss/startup-scripts/

#ENTRYPOINT [ "tail", "-f", "/dev/null" ]