const { Construct } = require('constructs');
const ec2 = require('aws-cdk-lib/aws-ec2');

class BitcoinSecurityGroup extends Construct {
    constructor(scope, id, vpc) {
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

module.exports = { BitcoinSecurityGroup };
