import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const Protocols = [
  {name: 'Ethereum', detail: 'Execution + consensus clients'},
  {name: 'Solana', detail: 'Agave & Frankendancer'},
  {name: 'Base', detail: 'OP Stack Layer 2'},
  {name: 'BNB Chain', detail: 'BNB Smart Chain'},
  {name: 'Bitcoin', detail: 'Bitcoin Core nodes'},
];

export default function SupportedProtocols() {
  return (
    <section className={styles.protocols}>
      <div className="container">
        <div className="text--center">
          <h2 className={styles.sectionTitle}>Six built-in blueprints, any protocol you add</h2>
          <p className={styles.sectionSubtitle}>
            Ships with five production protocols plus a Dummy reference
            blueprint for testing. Add your own without touching the CDK
            core — or install one a community member already published.
          </p>
        </div>
        <div className={styles.grid}>
          {Protocols.map((protocol) => (
            <div key={protocol.name} className={styles.card}>
              <div className={styles.cardName}>{protocol.name}</div>
              <div className={styles.cardDetail}>{protocol.detail}</div>
            </div>
          ))}
          <Link
            to="/docs/blueprints/about"
            className={clsx(styles.card, styles.cardAction)}>
            <div className={styles.cardName}>+ Your Protocol</div>
            <div className={styles.cardDetail}>Add a blueprint, no core changes</div>
          </Link>
        </div>
        <div className="text--center">
          <Link className={styles.learnMoreLink} to="/docs/blueprints/about">
            Explore all blueprints →
          </Link>
        </div>
      </div>
    </section>
  );
}
