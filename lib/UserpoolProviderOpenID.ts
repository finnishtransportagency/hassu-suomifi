import * as constructs from 'constructs';
import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito';

export interface OpenIDProviderDetails {
    clientId: string,
    clientSecret: string,
    method: string,
    oidcIssuer: string,
    authorizeScopes: string[],
    authorizeUrl: string,
    tokenUrl: string,
    attributesUrl: string,
    jwksUri: string
}

export interface OpenIDProviderProperties {
    attributeMapping: any,
    idpIdentifiers: string[],
    providerDetails: OpenIDProviderDetails,
    providerName: string,
    providerType: string,
    userpoolId: string
}

export class CognitoOpenIDProvider extends cdk.Construct {
    constructor(scope: constructs.Construct, id: string, props: OpenIDProviderProperties){
        super(scope,id);

        const cfnUserPoolIdentityProvider = new cognito.CfnUserPoolIdentityProvider(this, 'UserPoolIDP', {
            providerName: props.providerName,
            providerType: props.providerType,
            userPoolId: props.userpoolId,
            attributeMapping: props.attributeMapping,
            idpIdentifiers: props.idpIdentifiers,
            providerDetails: props.providerDetails
        });
    }

}