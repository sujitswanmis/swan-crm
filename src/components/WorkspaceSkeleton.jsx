import styles from './WorkspaceSkeleton.module.css';

export default function WorkspaceSkeleton({ variant = 'default' }) {
  const isTable = variant === 'table';

  return (
    <div className={styles.root} role="status" aria-label="Loading content" aria-live="polite">
      <span className={styles.srOnly}>Loading content</span>
      <div className={styles.heading}>
        <div className={`${styles.shimmer} ${styles.title}`} />
        <div className={`${styles.shimmer} ${styles.action}`} />
      </div>
      <div className={styles.filters}>
        <div className={`${styles.shimmer} ${styles.search}`} />
        <div className={`${styles.shimmer} ${styles.filter}`} />
        <div className={`${styles.shimmer} ${styles.filter}`} />
      </div>
      {isTable ? (
        <div className={styles.table}>
          <div className={`${styles.shimmer} ${styles.tableHead}`} />
          {Array.from({ length: 7 }, (_, index) => (
            <div className={styles.row} key={index}>
              <div className={`${styles.shimmer} ${styles.cellWide}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cellShort}`} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.cards}>
            {Array.from({ length: 3 }, (_, index) => (
              <div className={styles.card} key={index}>
                <div className={`${styles.shimmer} ${styles.cardLabel}`} />
                <div className={`${styles.shimmer} ${styles.cardValue}`} />
              </div>
            ))}
          </div>
          <div className={styles.panel}>
            <div className={`${styles.shimmer} ${styles.panelTitle}`} />
            <div className={`${styles.shimmer} ${styles.panelBody}`} />
          </div>
        </>
      )}
    </div>
  );
}
