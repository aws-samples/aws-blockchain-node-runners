import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Open Source',
    Icon: "⚀",
    description: (
       <span>
        Deployment code is fully open source and available on GitHub. You can see what you are going to deploy before deploying it.
       </span>
    ),
  },
  {
    title: 'Scalable',
    Icon: "⚁",
    description: (
      <span>
          Best Practice Blockchain Nodes Deployment Templates and Examples to run across Regions.
      </span>
    ),
  },
  {
    title: 'Highly Available',
    Icon: "⚂",
    description: (
        <span>
            Multi-Node Highly Available deployment options to run across Availability Zones.
        </span>
    ),
  },
];

function Feature({Icon, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        {/* <svg className={styles.featureSvg} style={{width: '40%'}} role="img" /> */}
        <span className={styles.featureUnicodeChar}>{Icon}</span>
      </div>
      <div className="text--center padding-horiz--md">
        <h2><b>{title}</b></h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
