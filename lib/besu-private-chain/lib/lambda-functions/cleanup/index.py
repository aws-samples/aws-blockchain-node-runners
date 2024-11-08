import boto3
import os

def handler(event, context):
    route53 = boto3.client('route53')
    hosted_zone_id = os.getenv('HOSTED_ZONE_ID')
    
    # List all records in the hosted zone
    paginator = route53.get_paginator('list_resource_record_sets')
    for page in paginator.paginate(HostedZoneId=hosted_zone_id):
        for record_set in page['ResourceRecordSets']:
            # Skip SOA and NS records to avoid deleting default zone records
            if record_set['Type'] in ('NS', 'SOA'):
                continue

            # Delete the record
            try:
                route53.change_resource_record_sets(
                    HostedZoneId=hosted_zone_id,
                    ChangeBatch={
                        'Changes': [{
                            'Action': 'DELETE',
                            'ResourceRecordSet': record_set
                        }]
                    }
                )
            except Exception as e:
                print(f"Error deleting record: {record_set['Name']} - {str(e)}")
    
    return {"status": "success"}
