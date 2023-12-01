#/usr/bin/env bash
CLUSTER=`aws ecs list-clusters --output text | awk '{print $2}'`
echo "Cluster: $CLUSTER"
TASK=`aws ecs list-tasks --cluster $CLUSTER --output text | awk -F/ '{print $3}'`
echo "Task: $TASK"
aws ecs execute-command  \
    --region eu-west-1 \
    --cluster $CLUSTER \
    --task $TASK \
    --container KeycloakContainer \
    --command "/bin/bash" \
    --interactive
