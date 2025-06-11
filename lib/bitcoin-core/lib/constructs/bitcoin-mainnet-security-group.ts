import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class BitcoinSecurityGroup extends Construct {
    public readonly securityGroup: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, vpc: ec2.IVpc) {
        super(scope, id);

        const sg = new ec2.SecurityGroup(this, 'BitcoinSG', {
            vpc,
            allowAllOutbound: true,
        });

        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8333), 'Bitcoin P2P');
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8332), 'Bitcoin RPC from VPC');

        this.securityGroup = sg;
    }
}

