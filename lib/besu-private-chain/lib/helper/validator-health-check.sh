MAX_BLOCKDELAY_BEFORE_HEALTHY=15
LOG_FILE=/var/log/besu_init_check.log
echo "besu_init_check : starting readiness check" >>$LOG_FILE

while true; do
    # Check if node has commited block in last 15 seconds
    timestamphex=$(curl -s --header "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["latest", false],"id":1}' localhost:8545 | jq -r ' .result.timestamp' | awk '{ print substr($0, 3 ) }')
    timestamp=$(echo $((16#$timestamphex)))

    currentTime=$(date +%s)
    echo "latest block timestamp $timestamp vs currentTime $currentTime" >>$LOG_FILE
    NEWBLOCK=$(expr $timestamp '>' $currentTime - $MAX_BLOCKDELAY_BEFORE_HEALTHY)
    
    if [[ $NEWBLOCK == 1 ]]; then
        CONTAINER_ID=$(docker ps | grep besu | awk '{print $1}') 
        PRODUCED_BLOCK=$(docker logs -n 100 "$CONTAINER_ID" | grep Produced)
        if [[ -z "$PRODUCED_BLOCK" ]]; then
            echo "Besu is all synced up, but validator has not produced a block yet. " >>$LOG_FILE 
        else
            echo $PRODUCED_BLOCK >>$LOG_FILE
            echo "Besu is all synced up. Breaking out of loop." >>$LOG_FILE
            break
        fi 
    else
        DATETIMESTAMP=$(date)
        echo "$DATETIMESTAMP : Besu is still not at the top block." >>$LOG_FILE
    fi
    sleep 10
done

/opt/aws/bin/cfn-signal2 --success true --stack __STACK_NAME__ --resource __ASG_ID__ --region __REGION__
