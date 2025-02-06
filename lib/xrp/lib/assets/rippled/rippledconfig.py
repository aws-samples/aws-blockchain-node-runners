# amazonq-ignore-next-line
rippled_cfg_file = "/opt/ripple/etc/rippled.cfg"
rippled_validator_file = "/opt/ripple/etc/validators.txt"
xrp_defaults = {
    "server_ports": {
        "port_peer": {
            "port": "51235",
            "protocol": "peer",
            "ip": "0.0.0.0",
        },
        "port_rpc_admin_local": {
            "port": "5005",
            "ip": "127.0.0.1",
            "admin": "127.0.0.1",
            "protocol": "http,https",
        },
        "port_ws_admin_local": {
            "port": "6006",
            "ip": "127.0.0.1",
            "admin": "127.0.0.1",
            "protocol": "ws,wss",
        },
    },
    "db_defaults": {
        "node_db": {
            "type": "NuDB",
            "path": "/var/lib/rippled/db/nudb",
            "online_delete": "512",
            "advisory_delete": "1",
        }
    },
    "network_defaults": {
        "mainnet": {
            "network_id": "mainnet",
            "ssl_verify": "1",
            "validator_list_sites": ["https://vl.ripple.com"],
            "validator_list_keys": [
                "ED2677ABFFD1B33AC6FBC3062B71F1E8397C1505E1C42C64D11AD1B28FF73F4734"
            ],
        },
        "testnet": {
            "network_id": "testnet",
            "ssl_verify": "0",
            "ips": "s.altnet.rippletest.net 51235",
            "validator_list_sites": ["https://vl.altnet.rippletest.net"],
            "validator_list_keys": [
                "ED264807102805220DA0F312E71FC2C69E1552C9C5790F6C25E3729DEB573D5860"
            ],
        },
    },
}
