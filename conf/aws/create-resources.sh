#!/bin/sh
aws logs create-log-group --log-group-name /aws/ecs/ecs-exec-dev --region $AWS_REGION
aws s3api create-bucket --bucket $ECS_EXEC_BUCKET_NAME --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION 

KMS_KEY=$(aws kms create-key --region $AWS_REGION)
KMS_KEY_ARN=$(echo $KMS_KEY | jq --raw-output .KeyMetadata.Arn)
aws kms create-alias --alias-name alias/ecs-exec-dev-kms-key --target-key-id $KMS_KEY_ARN --region $AWS_REGION
echo "The KMS Key ARN is: "$KMS_KEY_ARN 


aws ecs update-cluster \
    --cluster Dev-SuomifiService-ECSCluster7D463CD4-FjZIXYzcjPS2 \
    --region $AWS_REGION \
    --configuration executeCommandConfiguration="{logging=OVERRIDE,\
                                                kmsKeyId=$KMS_KEY_ARN,\
                                                logConfiguration={cloudWatchLogGroupName="/aws/ecs/ecs-exec-dev",\
                                                                s3BucketName=$ECS_EXEC_BUCKET_NAME,\
                                                                s3KeyPrefix=exec-output}}"

#aws iam create-role --role-name ecs-exec-dev-task-execution-role --assume-role-policy-document file://ecs-tasks-trust-policy.json --region $AWS_REGION
aws iam create-role --role-name ecs-exec-dev-task-role --assume-role-policy-document file://ecs-tasks-trust-policy.json --region $AWS_REGION


aws iam put-role-policy \
    --role-name Dev-SuomifiService-TaskDefinitionTaskRoleFD40A61D-HBH13HT5R7BF \
    --policy-name ecs-exec-dev-task-role-policy \
    --policy-document file://ecs-exec-dev-task-role-policy.json

aws ecs update-service \
    --cluster arn:aws:ecs:eu-west-1:283563576583:cluster/Dev-SuomifiService-ECSCluster7D463CD4-FjZIXYzcjPS2 \
    --service Dev-SuomifiService-ServiceD69D759B-lPDQW4xepT1j \
    --enable-execute-command




aws ecs execute-command  \
    --region $AWS_REGION \
    --cluster arn:aws:ecs:eu-west-1:283563576583:cluster/Dev-SuomifiService-ECSCluster7D463CD4-FjZIXYzcjPS2 \
    --task c0479903fc9e406cb502614f978ccb66 \
    --container KeycloakContainer \
    --command "/bin/bash" \
    --interactive