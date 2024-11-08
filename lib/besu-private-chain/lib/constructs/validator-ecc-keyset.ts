import { Construct } from 'constructs';
import { Role } from 'aws-cdk-lib/aws-iam';
import { ResourceName } from '../constants/resource-names';
import { ValidatorECCKey } from './validator-ecc-key';
import { RemovalPolicy } from 'aws-cdk-lib';
import { PropagatedTagSource } from 'aws-cdk-lib/aws-ecs';

/*
  This construct creates an indexed set of validator keys and associated roles.
  New Keys can be added by adding new numbers to the activeKeyNumbers parameter.
  
  Old Keys can be removed from the stack by removing numbers in the activeKeyNumbers parameter. 
  When removed, keys will not be automatically deleted, and should be cleaned up by the operator.
*/
export interface ValidatorECCKeySetProps {
  numberOfKeys: number;
  stage: string;
  region: string;
  retainRoles?: boolean;
  namePrefix: string;
}

export class ValidatorECCKeySet extends Construct {
  public readonly eccKeys: Map<number, ValidatorECCKey>;

  constructor(scope: Construct, id: string, props: ValidatorECCKeySetProps) {
    super(scope, id);

    this.eccKeys = new Map<number, ValidatorECCKey>();

    for (let keyNumber = 0; keyNumber < props.numberOfKeys; keyNumber++) {
      const kmsKey = new ValidatorECCKey(this, `${ResourceName.SM.KeyNamePrefix}${keyNumber}`, {
        keyNumber: keyNumber,
        roleRemovalPolicy: props.retainRoles ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        namePrefix: props.namePrefix,
      });
      this.eccKeys.set(keyNumber, kmsKey);
    }
  }

  getAllRoles(): Array<Role> {
    return [...this.eccKeys.values()].map((key) => key.iamRole);
  }

  getKeyNumToPublicKey(): Map<string, string> {
    return new Map([...this.eccKeys].map(([k, v]) => [k.toString(), v.publicKey as string]));
  }

  keys(): Array<number> {
    return Array.from(this.eccKeys.keys());
  }

  size(): number {
    return this.eccKeys.size;
  }
}
