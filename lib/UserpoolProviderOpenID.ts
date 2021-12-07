import * as constructs from 'constructs';
import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito';

export interface OpenIDProviderDetails {
    client_id: string,
    client_secret: string,
    attributes_request_method: string,
    oidc_issuer: string,
    authorize_scopes: string,
    authorize_url: string,
    token_url: string,
    attributes_url: string,
    jwks_uri: string
}

export interface OpenIDProviderProperties {
    AttributeMapping: any,
    IdpIdentifiers: string[],
    ProviderDetails: OpenIDProviderDetails,
    ProviderName: string,
    ProviderType: string,
    UserPoolId: string
}

export class CognitoOpenIDProvider extends cdk.Construct {
    constructor(scope: constructs.Construct, id: string, props: OpenIDProviderProperties){
        super(scope,id);

        const cfnUserPoolIdentityProvider = new cognito.CfnUserPoolIdentityProvider(this, 'UserPoolIDP', {
            providerName: props.ProviderName,
            providerType: props.ProviderType,
            userPoolId: props.UserPoolId,
            attributeMapping: props.AttributeMapping,
            idpIdentifiers: props.IdpIdentifiers,
            providerDetails: props.ProviderDetails
        });
    }

}