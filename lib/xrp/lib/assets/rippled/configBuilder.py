import configparser
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Tuple

import rippledconfig


@dataclass
class RippledConfig:
    """Class to handle Rippled configuration settings"""
    assets_path: Path
    xrp_network: str
    
    def __init__(self, assets_path: str):
        self.assets_path = Path(assets_path) / "rippled"
        self.xrp_network = os.environ.get("XRP_NETWORK", "mainnet")
        self.server_ports = rippledconfig.xrp_defaults["server_ports"]
        self.node_db_defaults = rippledconfig.xrp_defaults["db_defaults"]
        self.network_defaults = rippledconfig.xrp_defaults["network_defaults"]

    def load_config_files(self) -> Tuple[configparser.ConfigParser, configparser.ConfigParser]:
        """Load and parse configuration template files"""
        ripple_cfg = self._create_config_parser()
        validator_cfg = self._create_config_parser()

        ripple_cfg.read_string(self._read_template_file("rippled.cfg.template"))
        validator_cfg.read_string(self._read_template_file("validators.txt.template"))
        
        return ripple_cfg, validator_cfg

    def _read_template_file(self, filename: str) -> str:
        """Read a template file from the assets directory"""
        try:
            with open(self.assets_path / filename) as f:
                return f.read()
        except FileNotFoundError as e:
            raise FileNotFoundError(f"Template file {filename} not found in {self.assets_path}") from e

    @staticmethod
    def _create_config_parser() -> configparser.ConfigParser:
        """Create a configured ConfigParser instance"""
        parser = configparser.ConfigParser(
            allow_no_value=True,
            delimiters="=",
            empty_lines_in_values=False
        )
        parser.optionxform = str
        return parser

    def apply_network_configuration(self, ripple_cfg: configparser.ConfigParser, 
                                  validator_cfg: configparser.ConfigParser) -> None:
        """Apply network-specific configuration settings"""
        network_config = self.network_defaults[self.xrp_network]
        
        if self.xrp_network == "mainnet":
            self._configure_mainnet(ripple_cfg, validator_cfg, network_config)
        elif self.xrp_network == "testnet":
            self._configure_testnet(ripple_cfg, validator_cfg, network_config)

    def _configure_mainnet(self, ripple_cfg: configparser.ConfigParser,
                         validator_cfg: configparser.ConfigParser,
                         network_config: Dict[str, Any]) -> None:
        """Configure settings for mainnet"""
        ripple_cfg.remove_section("ips")
        ripple_cfg.set("network_id", network_config["network_id"])
        ripple_cfg['ssl_verify'].clear()
        ripple_cfg.set("ssl_verify", network_config["ssl_verify"])
        self._apply_common_config(ripple_cfg, validator_cfg, network_config)

    def _configure_testnet(self, ripple_cfg: configparser.ConfigParser,
                         validator_cfg: configparser.ConfigParser,
                         network_config: Dict[str, Any]) -> None:
        """Configure settings for testnet"""
        ripple_cfg.set("ips", network_config["ips"])
        ripple_cfg.set("network_id", network_config["network_id"])
        ripple_cfg['ssl_verify'].clear()
        ripple_cfg.set("ssl_verify", network_config["ssl_verify"])
        self._apply_common_config(ripple_cfg, validator_cfg, network_config)

    def _apply_common_config(self, ripple_cfg: configparser.ConfigParser,
                           validator_cfg: configparser.ConfigParser,
                           network_config: Dict[str, Any]) -> None:
        """Apply common configuration settings"""
        self._configure_server_ports(ripple_cfg)
        self._configure_node_db(ripple_cfg)
        self._configure_validators(validator_cfg, network_config)

    def _configure_server_ports(self, config: configparser.ConfigParser) -> None:
        """Configure server ports settings"""
        for section, settings in self.server_ports.items():
            for key, value in settings.items():
                config.set(section, key, value)

    def _configure_node_db(self, config: configparser.ConfigParser) -> None:
        """Configure node database settings"""
        for section, settings in self.node_db_defaults.items():
            for key, value in settings.items():
                config.set(section, key, value)

    def _configure_validators(self, config: configparser.ConfigParser,
                            network_config: Dict[str, Any]) -> None:
        """Configure validator settings"""
        for section in config.sections():
            config[section].clear()
            config.set(section, "\n".join(map(str, network_config[section])))

def main():
    """Main function to generate Rippled configuration"""
    try:
        assets_path = sys.argv[1]
        config_handler = RippledConfig(assets_path)
        
        ripple_cfg, validator_cfg = config_handler.load_config_files()
        config_handler.apply_network_configuration(ripple_cfg, validator_cfg)

        # Write configurations to files
        with open(rippledconfig.rippled_cfg_file, "w") as r_cfg:
            ripple_cfg.write(r_cfg, space_around_delimiters=True)
        with open(rippledconfig.rippled_validator_file, "w") as val_cfg:
            validator_cfg.write(val_cfg, space_around_delimiters=True)

    except IndexError:
        print("Error: Please provide the assets path as a command line argument")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()