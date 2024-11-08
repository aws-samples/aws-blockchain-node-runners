import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { CfnFunction } from 'aws-cdk-lib/aws-sam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export class ChainEventHandlerLambda extends NodejsFunction {
  constructor(
    scope: Construct,
    id: string,
    props: NodejsFunctionProps & {
      functionPath: string;
      functionName: string;
      logicalId: string;
      environment: object;
      hostedZoneId?: string;
      runtime?: Runtime;
    },
  ) {
    super(scope, id, {
      ...props,
      entry: props.functionPath,
      bundling: {
        externalModules: ['aws-sdk'],
        commandHooks: {
          afterBundling: () => [],
          beforeBundling: () => [
            // NodejsFunction relies on the executable version of esbuild
            // It uses npx to pull the executable, which requires access to npm
            // when the executable isn't in the path. find esbuild
            'ESBUILD_LOC="./node_modules/esbuild/bin"',
            '[[ -d "$ESBUILD_LOC" ]] || echo "Must install esbuild it was not at $ESBUILD_LOC!"',
            // add it to the path
            'PATH=$PATH:$ESBUILD_LOC',
          ],
          beforeInstall: () => [],
        },
      },
      runtime: props.runtime ?? Runtime.NODEJS_LATEST, 
      environment: props.environment,
      timeout: Duration.minutes(5),
      functionName: props.functionName,
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.RETAIN, // retain old versions
      },
    });
    // Override logical id to prevent issues where logical id change causes
    // function name conflict and breaks stack updates.
    const cfnLambda = this.node.defaultChild as CfnFunction;
    cfnLambda.overrideLogicalId(props.logicalId);
  }
}
