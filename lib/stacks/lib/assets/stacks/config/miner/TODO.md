# TODO

This directory should include two different files for the miner.

- **cw-agent.json**: A cloud watch agent configuration that will be coppied to the standard */opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json* directory without modification.
- **stacks.toml**: Configuration file template for a stacks miner with `$MY_ENVIRONMENT_VARIABLE` in places where the script should replace the templates info. **The current one in this directory is not verified to be right.**
