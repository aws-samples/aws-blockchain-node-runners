import { Construct } from 'constructs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Role, ServicePrincipal, CfnInstanceProfile, ManagedPolicy, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ResourceName } from '../constants/resource-names';
import { EC2DefaultPolicy } from '../constants/iam-utils';
import { PUBLIC_KEYS_BASE64 } from '../constants/keys';

export interface ValidatorECCKeyProps {
  keyNumber: number;
  roleRemovalPolicy: RemovalPolicy;
  namePrefix: string;
}

// This construct encompasses a ECC key and the role to sign with that key
// as well as relevant key details, such as key number and public key.
export class ValidatorECCKey extends Construct {
  public readonly eccSecret: Secret;
  public readonly keyNumber: number;
  public readonly publicKey: string;
  public readonly iamRole: Role;

  public readonly instanceProfile: CfnInstanceProfile;

  constructor(scope: Construct, id: string, props: ValidatorECCKeyProps) {
    super(scope, id);
    this.keyNumber = props.keyNumber;
    const keyRoleString = this.getVersionedKeyRoleString();
    const keyName = `${props.namePrefix}${ResourceName.SM.KeyNamePrefix}-${this.keyNumber}`;

    this.eccSecret = new Secret(this, 'smkey', {
      secretName: keyName,
    });

    this.iamRole = new Role(this, `${props.namePrefix}${ResourceName.SM.KeySigningRolePrefix}${keyRoleString}`, {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      description: `This role is meant for a Validator EC2 and has permission to sign with kms key "${this.keyNumber}."`,
      roleName: `${props.namePrefix}${ResourceName.SM.KeySigningRolePrefix}${keyRoleString}`,
      inlinePolicies: EC2DefaultPolicy,
    });
    this.iamRole.applyRemovalPolicy(props.roleRemovalPolicy);
    this.iamRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    this.iamRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    this.iamRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'),
    );
    this.iamRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));
    this.iamRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));

    this.iamRole.addToPolicy(
      new PolicyStatement({
        actions: ['cloudformation:Describe*', 'cloudformation:SignalResource' ],
        effect: Effect.ALLOW,
        resources: ['*'],
      })
    );

    // Instance profile should be created to allow assigning of the role to instances.
    this.instanceProfile = new CfnInstanceProfile(
      this,
      `${props.namePrefix}${ResourceName.EC2.ValidatorInstanceProfilePrefix}${keyRoleString}`,
      {
        roles: [this.iamRole.roleName],
        instanceProfileName: `${props.namePrefix}${ResourceName.EC2.ValidatorInstanceProfilePrefix}${keyRoleString}`,
      },
    );
    this.instanceProfile.applyRemovalPolicy(props.roleRemovalPolicy);

    this.eccSecret.grantRead(this.iamRole);
    this.publicKey = PUBLIC_KEYS_BASE64[this.keyNumber];
  }

  getVersionedKeyRoleString(): string {
    return `${this.keyNumber}-role-v1`;
  }
}
