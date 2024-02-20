# TODO

This directory should include two different files for the signer.

- **cw-agent.json**: A cloud watch agent configuration that will be coppied to the standard */opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json* directory without modification.
- **stacks.toml**: Configuration file template for a stacks signer with `$MY_ENVIRONMENT_VARIABLE` in places where the script should replace the templates info.
