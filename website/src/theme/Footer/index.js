import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

// Custom Footer, matching the structure and style of the Blockchain
// Snapshots on AWS landing page (https://awslabs.github.io/blockchain-snapshots/):
// a brand column with the AWS logo and a disclaimer paragraph, two link
// columns (Project, Ecosystem), and a legal line.
export default function Footer() {
  const logo = useBaseUrl('img/cube-logo-white.svg');
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.wrap}>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <img className={styles.logo} src={logo} alt="AWS" />
            <p className={styles.muted}>
              Provided &ldquo;AS IS&rdquo; without warranty. This is an{' '}
              <code>aws-samples</code> project, not an AWS service, and
              carries no SLA.
            </p>
          </div>
          <div>
            <h3 className={styles.heading}>Project</h3>
            <ul>
              <li>
                <a href="https://github.com/aws-samples/aws-blockchain-node-runners">
                  GitHub repository
                </a>
              </li>
              <li>
                <a href="/docs/getting-started/quickstart">Getting started</a>
              </li>
              <li>
                <a href="https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/LICENSE">
                  License (MIT-0)
                </a>
              </li>
              <li>
                <a href="https://github.com/aws-samples/aws-blockchain-node-runners/security/policy">
                  Security
                </a>
              </li>
              <li>
                <a href="https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/CONTRIBUTING.md">
                  Contributing
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className={styles.heading}>Web3 on AWS</h3>
            <ul>
              <li>
                <a href="https://aws.amazon.com/web3/">Web3 on AWS</a>
              </li>
              <li>
                <a href="https://aws.amazon.com/blogs/web3/">AWS Web3 Blog</a>
              </li>
              <li>
                <a href="https://awslabs.github.io/blockchain-snapshots/">
                  Blockchain Snapshots on AWS
                </a>
              </li>
              <li>
                <a href="https://registry.opendata.aws/aws-public-blockchain/">
                  AWS Public Blockchain Data
                </a>
              </li>
              <li>
                <a href="https://startups.aws.com/lp/web3">
                  AWS Activate for Web3 Startups
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p className={styles.legal}>
          © {year}, Amazon Web Services, Inc. or its affiliates. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
