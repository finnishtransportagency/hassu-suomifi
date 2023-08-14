import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

async function fetchSigningCertificate() {
  // Fetch saml metadata from https://static.apro.tunnistus.fi/static/metadata/idp-metadata.xml
  const response = await fetch(
    "https://static.apro.tunnistus.fi/static/metadata/idp-metadata.xml"
  );
  const xml = await response.text();
  // Parse X509Certificate elements from the response xml using fast-xml-parser
  const parser = new XMLParser();
  const json = parser.parse(xml);
  const certs: string[] = [];
  traverseAndFindCertificates(json, certs);
  return certs.join(",\n");
}

function traverseAndFindCertificates(jsonObj: any, certs: string[]) {
  if (jsonObj !== null && typeof jsonObj == "object") {
    Object.entries(jsonObj).forEach(([key, value]) => {
      // key is either an array index or object key
      if (key === "ds:X509Certificate") {
        certs.push(value as string);
      }
      traverseAndFindCertificates(value, certs);
    });
  }
}

async function main(): Promise<void> {
  const signingCertificate = await fetchSigningCertificate();
  console.log("Kopioi sertifikaatit keycloakin admin-liittymään Suomifi-realmiin: Identity Providers -> Valtion liikenneväylien suunnittelu SAML -> Validating X509 Certificates");
  console.log("------------------------");
  console.log(signingCertificate);
  console.log("------------------------");
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((error) => {
    console.error(error);
  });
