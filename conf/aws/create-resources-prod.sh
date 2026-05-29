#!/bin/sh
aws logs create-log-group --log-group-name /aws/ecs/ecs-exec-prod --region $AWS_REGION
aws s3api create-bucket --bucket $ECS_EXEC_BUCKET_NAME --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION 

KMS_KEY=$(aws kms create-key --region $AWS_REGION)
KMS_KEY_ARN=$(echo $KMS_KEY | jq --raw-output .KeyMetadata.Arn)
aws kms create-alias --alias-name alias/ecs-exec-prod-kms-key --target-key-id $KMS_KEY_ARN --region $AWS_REGION
echo "The KMS Key ARN is: "$KMS_KEY_ARN 


aws ecs update-cluster \
    --cluster Prod-SuomifiService-ECSCluster7D463CD4-CzX4diQJA55v \
    --region $AWS_REGION \
    --configuration executeCommandConfiguration="{logging=OVERRIDE,\
                                                kmsKeyId=$KMS_KEY_ARN,\
                                                logConfiguration={cloudWatchLogGroupName="/aws/ecs/ecs-exec-prod",\
                                                                s3BucketName=$ECS_EXEC_BUCKET_NAME,\
                                                                s3KeyPrefix=exec-output}}"

#aws iam create-role --role-name ecs-exec-dev-task-execution-role --assume-role-policy-document file://ecs-tasks-trust-policy.json --region $AWS_REGION
aws iam create-role --role-name ecs-exec-prod-task-role --assume-role-policy-document file://ecs-tasks-trust-policy.json --region $AWS_REGION


aws iam put-role-policy \
    --role-name Prod-SuomifiService-TaskDefinitionTaskRoleFD40A61D-4SnWltT2sjwF \
    --policy-name ecs-exec-prod-task-role-policy \
    --policy-document file://ecs-exec-prod-task-role-policy.json

aws ecs update-service \
    --cluster arn:aws:ecs:eu-west-1:385766954911:cluster/Prod-SuomifiService-ECSCluster7D463CD4-CzX4diQJA55v \
    --service Prod-SuomifiService-ServiceD69D759B-Fiz7Kw2RKEOt \
    --enable-execute-command




aws ecs execute-command  \
    --region $AWS_REGION \
    --cluster arn:aws:ecs:eu-west-1:385766954911:cluster/Prod-SuomifiService-ECSCluster7D463CD4-CzX4diQJA55v \
    --task 7b67e381d2524ed7813176b0aeb93aaf \
    --container KeycloakContainer \
    --command "/bin/bash" \
    --interactive