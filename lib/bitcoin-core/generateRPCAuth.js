const crypto = require('crypto');
const base64url = require('base64url');
const fs = require('fs');
const { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Set up AWS SDK client
const client = new SecretsManagerClient({ region: 'us-east-1' }); // Change region if needed

// Create size byte hex salt
function genSalt(size = 16) {
    const buffer = crypto.randomBytes(size);
    return buffer.toString('hex');
}

// Create 32 byte b64 password
function genPass(size = 32) {
    const buffer = crypto.randomBytes(size);
    return base64url.fromBase64(buffer.toString('base64'));
}

function genUser() {
    return 'user_' + Math.round(Math.random() * 1000);
}

function genHash(password, salt) {
    const hash = crypto
        .createHmac('sha256', salt)
        .update(password)
        .digest('hex');
    return hash;
}

function genRpcAuth(username = genUser(), password = genPass(), salt = genSalt()) {
    const hash = genHash(password, salt);
    return { username, password, salt, hash };
}

function writeRpcAuthToConf(rpcauthStr) {
    const confPath = 'lib/bitcoin.conf';
    try {
        fs.writeFileSync(confPath, rpcauthStr + '\n', { flag: 'a' });
        console.log(`Successfully wrote to ${confPath}`);
    } catch (error) {
        console.error(`Error writing to ${confPath}:`, error);
    }
}

async function storeCredentialsInAWS(username, password) {
    const secretName = 'bitcoin_rpc_credentials';
    const secretValue = `${username}:${password}`;

    try {
        const createCommand = new CreateSecretCommand({
            Name: secretName,
            SecretString: secretValue,
        });
        await client.send(createCommand);
        console.log(`Successfully stored credentials in AWS Secrets Manager: ${secretName}`);
    } catch (error) {
        if (error.name === 'ResourceExistsException') {
            const updateCommand = new PutSecretValueCommand({
                SecretId: secretName,
                SecretString: secretValue,
            });
            await client.send(updateCommand);
            console.log(`Successfully updated existing secret in AWS Secrets Manager: ${secretName}`);
        } else {
            console.error(`Error storing credentials in AWS Secrets Manager:`, error);
        }
    }
}

async function genRpcAuthStr(username, password, salt) {
    const rpcauth = genRpcAuth(username, password, salt);
    const str = `rpcauth=${rpcauth.username}:${rpcauth.salt}$${rpcauth.hash}`;
    const strEscapeCharacter = `rpcauth=${rpcauth.username}:${rpcauth.salt}\\$${rpcauth.hash}`;
    console.log(`Username: ${rpcauth.username}`);
    console.log("Password generated securely and stored in Secrets Manager");
    console.log(`rpcauth string with escape character: ${strEscapeCharacter}`);  // Print the rpcauth string

    // Write to bitcoin.conf
    writeRpcAuthToConf(str);

    // Store in AWS Secrets Manager
    await storeCredentialsInAWS(rpcauth.username, rpcauth.password);

    return str;
}

// Example usage
genRpcAuthStr();

module.exports = {
    genSalt,
    genPass,
    genUser,
    genHash,
    genRpcAuth,
    genRpcAuthStr,
};
