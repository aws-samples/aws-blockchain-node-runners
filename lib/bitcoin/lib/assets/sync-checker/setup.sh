#!/bin/bash
# Setup Bitcoin sync checker for CloudWatch metrics

echo "Setting up Bitcoin sync checker"

cat > /opt/sync-checker/check-sync.sh << 'EOF'
#!/bin/bash
# Bitcoin sync checker - publishes metrics to CloudWatch

source /etc/cdk_environment

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)

# Get blockchain info from Bitcoin Core
BLOCKCHAIN_INFO=$(bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getblockchaininfo 2>/dev/null)

if [ $? -eq 0 ]; then
    BLOCK_HEIGHT=$(echo "$BLOCKCHAIN_INFO" | jq -r '.blocks')
    VERIFICATION_PROGRESS=$(echo "$BLOCKCHAIN_INFO" | jq -r '.verificationprogress')
    
    # Get network info
    NETWORK_INFO=$(bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getnetworkinfo 2>/dev/null)
    CONNECTIONS=$(echo "$NETWORK_INFO" | jq -r '.connections')
    
    # Get mempool info
    MEMPOOL_INFO=$(bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getmempoolinfo 2>/dev/null)
    MEMPOOL_SIZE=$(echo "$MEMPOOL_INFO" | jq -r '.size')
    
    # Publish metrics to CloudWatch
    aws cloudwatch put-metric-data \
        --region "$AWS_REGION" \
        --namespace "CWAgent" \
        --metric-name "bitcoin_block_height" \
        --value "$BLOCK_HEIGHT" \
        --dimensions "InstanceId=$INSTANCE_ID"
    
    aws cloudwatch put-metric-data \
        --region "$AWS_REGION" \
        --namespace "CWAgent" \
        --metric-name "bitcoin_verification_progress" \
        --value "$VERIFICATION_PROGRESS" \
        --dimensions "InstanceId=$INSTANCE_ID"
    
    aws cloudwatch put-metric-data \
        --region "$AWS_REGION" \
        --namespace "CWAgent" \
        --metric-name "bitcoin_connections" \
        --value "$CONNECTIONS" \
        --dimensions "InstanceId=$INSTANCE_ID"
    
    aws cloudwatch put-metric-data \
        --region "$AWS_REGION" \
        --namespace "CWAgent" \
        --metric-name "bitcoin_mempool_size" \
        --value "$MEMPOOL_SIZE" \
        --dimensions "InstanceId=$INSTANCE_ID"
fi
EOF

chmod +x /opt/sync-checker/check-sync.sh

# Add cron job to run every minute
(crontab -l 2>/dev/null; echo "* * * * * /opt/sync-checker/check-sync.sh > /dev/null 2>&1") | crontab -

echo "Sync checker setup complete"
