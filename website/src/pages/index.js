import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HowItWorks from '@site/src/components/HowItWorks';
import SupportedProtocols from '@site/src/components/SupportedProtocols';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  const heroBg = useBaseUrl('img/bg-pattern-modular-dark-blue.jpg');
  return (
    <header
      className={styles.heroBanner}
      style={{backgroundImage: `url('${heroBg}')`}}>
      <div className={clsx('container', styles.heroGrid)}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            Deploy a blockchain node on AWS by describing it
          </h1>
          <p className={styles.heroLead}>
            One CDK framework. Six protocol blueprints, from Ethereum to
            Solana. Tell your AI assistant what you need, and Node Runners
            picks the instance type, provisions the stack, and keeps it
            healthy.
          </p>
          <ul className={styles.ctaRow}>
            <li>
              <Link className={styles.cta} to="/docs/getting-started/quickstart">
                Get started
              </Link>
            </li>
            <li>
              <Link className={styles.cta} to="/docs/blueprints/about">
                Explore blueprints
              </Link>
            </li>
            <li>
              <Link
                className={styles.cta}
                to="https://github.com/aws-samples/aws-blockchain-node-runners">
                View on GitHub
              </Link>
            </li>
          </ul>
          <dl className={styles.facts}>
            <div>
              <dt>Protocols</dt>
              <dd>Ethereum, Solana, Base, BNB Chain, Bitcoin</dd>
            </div>
            <div>
              <dt>Deployment modes</dt>
              <dd>Single node, HA (multi-node + load balancer)</dd>
            </div>
            <div>
              <dt>Infrastructure</dt>
              <dd>AWS CDK, TypeScript</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>MIT-0</dd>
            </div>
          </dl>
        </div>
        <figure className={styles.terminal} aria-label="Example AI-guided deploy prompt">
          <div className={styles.terminalBar}>
            <span className={styles.terminalDots} aria-hidden="true">
              <i></i><i></i><i></i>
            </span>
            <span className={styles.terminalTitle}>Kiro CLI</span>
          </div>
          <pre className={styles.terminalBody}>
            <code>
              <span className={styles.tPrompt}>@</span>
              <span className={styles.tCmd}>deploy a Solana RPC node optimized for cost</span>
              {'\n\n'}
              <span className={styles.tOut}>{`📋 DEPLOYMENT SUMMARY
Protocol:        solana
Network:         mainnet
Client:          Agave
Instance type:   (recommended from blueprint + Pricing API)
Storage:         (sized for mainnet ledger + accounts)
Deployment mode: single-node

💰 ESTIMATED MONTHLY COST
(shown before every deployment — see Step 4)

Type "yes" to deploy, or "no" to cancel.`}</span>
              <span className={styles.tCursor} aria-hidden="true"></span>
            </code>
          </pre>
        </figure>
      </div>
    </header>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  const bandImage = useBaseUrl('img/band-innovation-2.jpg');
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="AI-driven blockchain node infrastructure experimentation and optimization on AWS">
      <HomepageHeader />
      <figure className={styles.band} aria-hidden="true">
        <img src={bandImage} alt="" />
      </figure>
      <main>
        <HomepageFeatures />
        <HowItWorks />
        <SupportedProtocols />
      </main>
    </Layout>
  );
}
