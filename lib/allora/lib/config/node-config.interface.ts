import * as configTypes from "../../../constructs/config.interface";

export interface AlloraDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface AlloraBaseConfig extends configTypes.BaseConfig {

}

export interface AlloraSingleNodeConfig extends configTypes.SingleNodeConfig {
    resourceNamePrefix: string,
    alloraWorkerName: string,
    alloraEnv: string,
    modelRepo: string,
    modelEnvVars: string,
  
    //Wallet config
    alloraWalletAddressKeyName: string,
    alloraWalletAddressRestoreMnemonic: string,
    alloraWalletHomeDir: string,
    alloraWalletGas: string,
    alloraWalletGasAdjustment: string,
  
    alloraWalletGasPrices: string,
    alloraWalletGasPriceInterval: string,
    alloraWalletRetryDelay: string,
    alloraWalletBlockDurationEstimated: string,
    alloraWalletWindowCorrectionFactor: string,
    alloraWalletAccountSequenceRetryDelay: string,
  
    alloraWalletNodeRpc: string,
    alloraWalletMaxRetries: string,
    alloraWalletDelay: string,
    alloraWalletSubmitTx: string,
    alloraWalletMaxFees: string,
  
    //Worker Properties
    alloraWorkerTopicId: string,
    alloraWorkerInferenceEntrypointName: string,
    alloraWorkerInferenceEndpoint: string,
    alloraWorkerLoopSeconds: string,
    alloraWorkerToken: string,
  
    //Reputer Properties
    alloraReputerTopicId: string,
    alloraReputerEntrypointName: string,
    alloraReputerSourceOfTruthEndpoint: string,
  
    alloraReputerLossFunctionService: string,
    alloraReputerLossMethodOptionsLossMethod: string,
  
    alloraReputerLoopSeconds: string,
    alloraReputerToken: string,
    alloraReputerMinStake: string,
}
