import { Construct } from 'constructs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

export interface ChainArtifactProps {
  readonly resourceId: PhysicalResourceId;
  readonly creatorfuncArn: string;
  readonly requestPayload?: any;
  readonly invocationType?: string;
}

export class ChainArtifactWrapper extends Construct {
  readonly chainArtifact: AwsCustomResource;

  constructor(scope: Construct, id: string, props: ChainArtifactProps) {
    super(scope, id);

    const lambdaCall = {
      service: 'Lambda',
      action: 'invoke',
      parameters: {
        FunctionName: props.creatorfuncArn,
        InvocationType: props.invocationType ?? 'Event',
        Payload: JSON.stringify(props.requestPayload ?? {}),
      },
      physicalResourceId: props.resourceId,
    };

    const customResourceProps = {
      onCreate: lambdaCall,
      onUpdate: lambdaCall,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          effect: Effect.ALLOW,
          //TODO: use props.creatorfuncArn when there is only one ChainArtifactWrapper
          resources: ['*'],
        }),
      ]),
    };
    this.chainArtifact = new AwsCustomResource(this, props.resourceId.toString(), customResourceProps);
  }

  getResponseField(field: string) {
    return this.chainArtifact.getResponseField(field);
  }
}
