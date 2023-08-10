FROM 283563576583.dkr.ecr.eu-west-1.amazonaws.com/jboss/keycloak

COPY ./lib/postgresql-42.2.24.jar /opt/jboss/keycloak/modules/system/layers/keycloak/org/postgresql/main/
COPY ./conf/jboss/postgresql/module.xml /opt/jboss/keycloak/modules/system/layers/keycloak/org/postgresql/main/
RUN sed -i -e 's/<web-context>auth<\/web-context>/<web-context>keycloak\/auth<\/web-context>/' /opt/jboss/keycloak/standalone/configuration/standalone.xml
RUN sed -i -e 's/<web-context>auth<\/web-context>/<web-context>keycloak\/auth<\/web-context>/' /opt/jboss/keycloak/standalone/configuration/standalone-ha.xml
RUN sed -i -e 's/\/auth\//\/keycloak\/auth\//' /opt/jboss/keycloak/welcome-content/index.html

COPY ./conf/keycloak/suomifi-realm-export.json /opt/jboss/keycloak/standalone/tmp/

USER root
ENV TZ=Europe/Helsinki
RUN microdnf update
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && microdnf clean all

# uncomment for debugging purposes and to keep container alive
# ENTRYPOINT [ "tail", "-f", "/dev/null" ]