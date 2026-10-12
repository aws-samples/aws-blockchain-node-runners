import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HowItWorks from '@site/src/components/HowItWorks';
import SupportedProtocols from '@site/src/components/SupportedProtocols';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <p className={styles.eyebrow}>Open source on AWS</p>
        <h1 className="hero__title">
          Deploy a blockchain node on AWS by describing it
        </h1>
        <p className={clsx('hero__subtitle', styles.heroSubtitle)}>
          One CDK framework. Six protocol blueprints, from Ethereum to
          Solana. Tell your AI assistant what you need, and Node Runners
          picks the instance type, provisions the stack, and keeps it
          healthy.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/quickstart">
            Get Started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/blueprints/about"
            style={{marginLeft: '1rem'}}>
            Explore Blueprints
          </Link>
        </div>
        <p className={styles.heroMeta}>
          MIT-0 licensed · AWS CDK (TypeScript) · maintained in{' '}
          <Link to="https://github.com/aws-samples/aws-blockchain-node-runners">
            aws-samples
          </Link>
        </p>
      </div>
    </header>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="AI-driven blockchain node infrastructure experimentation and optimization on AWS">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HowItWorks />
        <SupportedProtocols />
      </main>
    </Layout>
  );
}
