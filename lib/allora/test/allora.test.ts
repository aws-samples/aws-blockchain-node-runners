import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AlloraStack } from '../lib/allora-stack';
import * as ec2 from "aws-cdk-lib/aws-ec2";

describe("AlloranodeStack", () => {
  test('Stack has correct resources', () => {
    const app = new cdk.App();
    const stack = new AlloraStack(app, 'TestStack', {
      env: { account: '123456789', region: 'us-east-1' },
      instanceType: 't3.medium',
      vpcMaxAzs: 1,
      vpcNatGateways: 0,
      vpcSubnetCidrMask: 24,
      resourceNamePrefix: 'AlloraWorkerx',
      dataVolume: {
        sizeGiB: 256,
        type: ec2.EbsDeviceVolumeType.GP3,
        iops: 3000,
        throughput: 125
      },
      alloraWorkerName: 'aws',
      alloraEnv: 'dev',
      modelRepo: 'https://github.com/allora-network/basic-coin-prediction-node',
      modelEnvVars: '{}',
      alloraWalletAddressKeyName: 'xxxxxxxxxxx',
      alloraWalletAddressRestoreMnemonic: 'xxxxxxxxxxx',
      alloraWalletHomeDir: '',
      alloraWalletGas: '1000000',
      alloraWalletGasAdjustment: '1.0',
      alloraWalletGasPrices: '0.1,0.2',
      alloraWalletGasPriceInterval: '60',
      alloraWalletRetryDelay: '5',
      alloraWalletBlockDurationEstimated: '6',
      alloraWalletWindowCorrectionFactor: '0.8',
      alloraWalletMaxFees: '500',
      alloraWalletAccountSequenceRetryDelay: '2',
      alloraWalletNodeRpc: 'https://localhost:26657',
      alloraWalletMaxRetries: '1',
      alloraWalletDelay: '1',
      alloraWalletSubmitTx: 'false',
      alloraWorkerTopicId: '1',
      alloraWorkerInferenceEntrypointName: 'api-worker-reputer',
      alloraWorkerInferenceEndpoint: 'http://source:8000/inference/{Token}',
      alloraWorkerLoopSeconds: '30',
      alloraWorkerToken: 'ethereum',
      alloraReputerTopicId: '1',
      alloraReputerEntrypointName: 'api-worker-reputer',
      alloraReputerSourceOfTruthEndpoint: 'http://source:8888/truth/{Token}/{BlockHeight}',
      alloraReputerLoopSeconds: '30',
      alloraReputerToken: 'ethereum',
      alloraReputerMinStake: '100000',
      alloraReputerLossFunctionService: 'loss-service',
      alloraReputerLossMethodOptionsLossMethod: 'mse'
    });

    const template = Template.fromStack(stack);

    // Check for VPC
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: Match.stringLikeRegexp('10.0.0.0/16'),
    });

    // Check for Security Group with inbound TCP 9010 rule
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Allow inbound TCP 9010',
      SecurityGroupIngress: [
        {
          IpProtocol: 'tcp',
          FromPort: 9010,
          ToPort: 9010,
          CidrIp: '0.0.0.0/0',
        },
      ],
    });

    // Check for EC2 Instance
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't3.medium',
      ImageId: {
        "Ref": "SsmParameterValueawsserviceamiamazonlinuxlatestal2023amikernel61x8664C96584B6F00A464EAD1953AFF4B05118Parameter"
      },
      BlockDeviceMappings: [
        {
          DeviceName: '/dev/xvda',
          Ebs: {
            VolumeSize: 46,
            VolumeType: 'gp3',
          },
        },
      ],
    });

    // Check for EIP
    template.resourceCountIs('AWS::EC2::EIP', 1);

    // Check for EIP Association
    template.hasResourceProperties('AWS::EC2::EIPAssociation', {
      InstanceId: Match.anyValue(),
    });

    // Check for S3 Bucket
    template.resourceCountIs('AWS::S3::Bucket', 1);

    // Check for Bucket Deployment
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DestinationBucketName: {
        'Ref': Match.anyValue(),
      },
      DestinationBucketKeyPrefix: 'user-data',
      Prune: true,
      ServiceToken: {
        'Fn::GetAtt': [
          Match.anyValue(),
          'Arn'
        ]
      },
      SourceBucketNames: [
        Match.anyValue(),
      ],
      SourceObjectKeys: [
        Match.stringLikeRegexp('.*\\.zip')
      ]
    });

    // Check for S3 bucket policy to allow read access to the EC2 instance
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      Bucket: {
        'Ref': Match.anyValue(),
      },
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "s3:PutBucketPolicy",
              "s3:GetBucket*",
              "s3:List*",
              "s3:DeleteObject*"
            ],
            Effect: 'Allow',
            Resource: [
              {
                'Fn::GetAtt': [
                  Match.anyValue(),
                  'Arn',
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        Match.anyValue(),
                        'Arn'
                      ]
                    },
                    '/*'
                  ]
                ],
              }
            ],
            Principal: {
              AWS: {
                'Fn::GetAtt': [
                  Match.anyValue(),
                  'Arn',
                ],
              },
            },
          }),
        ]),
        Version: '2012-10-17'
      },
    });

    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
      DashboardName: {
        "Fn::Join": ["", ["AlloraStack-", { "Ref": Match.anyValue() }]]
      }
    })
  });
});
