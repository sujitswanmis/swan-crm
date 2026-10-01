import React from 'react';
import styles from './WorkspaceSkeleton.module.css';

/**
 * Context-aware Skeleton Screens tailored to specific page designs & module layouts.
 * Supported variants:
 * - 'table' | 'leads' | 'report' | 'party' | 'team': Full tabular view with filters & pagination
 * - 'form' | 'registration': Structured multi-section form with labeled inputs & action buttons
 * - 'analytics' | 'dashboard': KPI metric cards, comparative bar charts, donut chart & summaries
 * - 'chat' | 'whatsapp' | 'ai': Split 2-column messaging interface with contact list & chat thread
 * - 'callcenter' | 'dialer': Agent status ribbon, keypad dialer card & recent call history
 * - 'attendance': Clock banner with punch in/out button, KPI stats & attendance calendar
 * - 'settings': Vertical sidebar menu & card-based settings configuration rows with toggle switches
 * - 'checklist' | 'delegation': Stage/period tabs, progress indicator bar & task item cards
 */
export default function WorkspaceSkeleton({ variant = 'default' }) {
  // Normalize variant string
  const v = (variant || 'default').toLowerCase();

  // 1. FORM VARIANT (Client Registration & Entry Forms)
  if (v === 'form' || v === 'registration') {
    return (
      <div className={styles.root} role="status" aria-label="Loading form" aria-live="polite">
        <span className={styles.srOnly}>Loading registration form</span>
        <div className={styles.heading}>
          <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '18rem' }} />
          <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '8rem' }} />
        </div>
        <div className={styles.formContainer}>
          {/* Section 1: Basic & Contact Details */}
          <div className={styles.formCard}>
            <div className={`${styles.shimmer} ${styles.formSectionTitle}`} />
            <div className={styles.formGrid3}>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
            </div>
            <div className={styles.formGrid3}>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
            </div>
          </div>

          {/* Section 2: Address & Business Requirements */}
          <div className={styles.formCard}>
            <div className={`${styles.shimmer} ${styles.formSectionTitle}`} style={{ width: '16rem' }} />
            <div className={styles.formGrid2}>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
              <div className={styles.formField}>
                <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                <div className={`${styles.shimmer} ${styles.fieldInput}`} />
              </div>
            </div>
            <div className={styles.formField}>
              <div className={`${styles.shimmer} ${styles.fieldLabel}`} style={{ width: '25%' }} />
              <div className={`${styles.shimmer} ${styles.fieldTextarea}`} />
            </div>
            <div className={styles.formActions}>
              <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '6.5rem' }} />
              <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '9rem' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. ANALYTICS / DASHBOARD VARIANT
  if (v === 'analytics' || v === 'dashboard') {
    return (
      <div className={styles.root} role="status" aria-label="Loading analytics dashboard" aria-live="polite">
        <span className={styles.srOnly}>Loading analytics dashboard</span>
        <div className={styles.heading}>
          <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '15rem' }} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className={`${styles.shimmer} ${styles.filter}`} />
            <div className={`${styles.shimmer} ${styles.action}`} />
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className={styles.kpiGrid4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={`${styles.card} ${styles.kpiCard}`} key={i}>
              <div className={styles.kpiHeader}>
                <div className={`${styles.shimmer} ${styles.kpiLabel}`} />
                <div className={`${styles.shimmer} ${styles.kpiIcon}`} />
              </div>
              <div className={`${styles.shimmer} ${styles.kpiValue}`} />
              <div className={`${styles.shimmer} ${styles.kpiTrend}`} />
            </div>
          ))}
        </div>

        {/* Charts Grid: Left Bar Chart, Right Donut */}
        <div className={styles.chartsGrid}>
          <div className={`${styles.card} ${styles.chartCard}`}>
            <div className={`${styles.shimmer} ${styles.chartTitle}`} />
            <div className={styles.chartBars}>
              {[50, 75, 40, 90, 65, 80, 55, 95, 70, 85].map((h, i) => (
                <div
                  key={i}
                  className={`${styles.shimmer} ${styles.chartBar}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className={`${styles.card} ${styles.chartCard}`}>
            <div className={`${styles.shimmer} ${styles.chartTitle}`} style={{ width: '9rem' }} />
            <div className={styles.donutContainer}>
              <div className={`${styles.shimmer} ${styles.chartDonut}`} />
              <div className={styles.donutLegend}>
                <div className={`${styles.shimmer} ${styles.legendItem}`} />
                <div className={`${styles.shimmer} ${styles.legendItem}`} />
                <div className={`${styles.shimmer} ${styles.legendItem}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Summary Table */}
        <div className={styles.table}>
          <div className={`${styles.shimmer} ${styles.tableHead}`} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={styles.row} key={i}>
              <div className={`${styles.shimmer} ${styles.cellWide}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cellShort}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. CHAT / MESSAGING VARIANT (WhatsApp Official, Unofficial, AI Chat)
  if (v === 'chat' || v === 'whatsapp' || v === 'ai') {
    return (
      <div className={styles.root} role="status" aria-label="Loading chat module" aria-live="polite">
        <span className={styles.srOnly}>Loading chat workspace</span>
        <div className={styles.chatContainer}>
          {/* Left Conversation List */}
          <div className={styles.chatSidebar}>
            <div className={`${styles.shimmer} ${styles.chatSearch}`} />
            <div className={styles.chatList}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div className={styles.chatListItem} key={i}>
                  <div className={`${styles.shimmer} ${styles.chatAvatar}`} />
                  <div className={styles.chatMeta}>
                    <div className={`${styles.shimmer} ${styles.chatName}`} />
                    <div className={`${styles.shimmer} ${styles.chatPreview}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Active Chat Workspace */}
          <div className={styles.chatMain}>
            <div className={styles.chatHeader}>
              <div className={`${styles.shimmer} ${styles.chatAvatar}`} style={{ width: '2.5rem', height: '2.5rem' }} />
              <div className={styles.chatHeaderMeta}>
                <div className={`${styles.shimmer} ${styles.chatHeaderName}`} />
                <div className={`${styles.shimmer} ${styles.chatHeaderStatus}`} />
              </div>
            </div>
            <div className={styles.chatFeed}>
              <div className={`${styles.shimmer} ${styles.chatBubbleLeft}`} />
              <div className={`${styles.shimmer} ${styles.chatBubbleRight}`} />
              <div className={`${styles.shimmer} ${styles.chatBubbleLeft}`} style={{ height: '4.5rem' }} />
              <div className={`${styles.shimmer} ${styles.chatBubbleRight}`} style={{ height: '2.5rem' }} />
              <div className={`${styles.shimmer} ${styles.chatBubbleLeft}`} style={{ height: '3rem' }} />
            </div>
            <div className={styles.chatInputBar}>
              <div className={`${styles.shimmer} ${styles.chatInput}`} />
              <div className={`${styles.shimmer} ${styles.chatSendBtn}`} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. CALL CENTER VARIANT
  if (v === 'callcenter' || v === 'dialer') {
    return (
      <div className={styles.root} role="status" aria-label="Loading call center" aria-live="polite">
        <span className={styles.srOnly}>Loading call center</span>
        <div className={styles.ccHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '13rem', height: '1.8rem' }} />
            <div className={`${styles.shimmer} ${styles.ccStatusPill}`} />
          </div>
          <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '8rem' }} />
        </div>
        <div className={styles.ccLayout}>
          {/* Left Column: Virtual Dialer Keypad */}
          <div className={`${styles.card} ${styles.ccDialerCard}`}>
            <div className={`${styles.shimmer} ${styles.ccDisplay}`} />
            <div className={styles.ccKeypad}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div className={`${styles.shimmer} ${styles.ccKey}`} key={i} />
              ))}
            </div>
            <div className={`${styles.shimmer} ${styles.ccCallAction}`} />
          </div>

          {/* Right Column: Live Call Logs */}
          <div className={styles.table}>
            <div className={styles.heading} style={{ marginBottom: '0.75rem', padding: '0.25rem' }}>
              <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '11rem', height: '1.6rem' }} />
              <div className={`${styles.shimmer} ${styles.search}`} style={{ width: '15rem', height: '2.2rem' }} />
            </div>
            <div className={`${styles.shimmer} ${styles.tableHead}`} />
            {Array.from({ length: 6 }).map((_, i) => (
              <div className={styles.row} key={i}>
                <div className={`${styles.shimmer} ${styles.cellWide}`} />
                <div className={`${styles.shimmer} ${styles.cell}`} />
                <div className={`${styles.shimmer} ${styles.cell}`} />
                <div className={`${styles.shimmer} ${styles.cellShort}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 5. ATTENDANCE VARIANT
  if (v === 'attendance') {
    return (
      <div className={styles.root} role="status" aria-label="Loading attendance module" aria-live="polite">
        <span className={styles.srOnly}>Loading attendance workspace</span>
        {/* Top Punch Banner */}
        <div className={styles.attBanner}>
          <div className={styles.punchClockBox}>
            <div className={`${styles.shimmer} ${styles.punchTime}`} />
            <div className={`${styles.shimmer} ${styles.punchDate}`} />
          </div>
          <div className={`${styles.shimmer} ${styles.punchBtn}`} />
        </div>

        {/* 4 Attendance KPI Counters */}
        <div className={styles.kpiGrid4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={`${styles.card} ${styles.kpiCard}`} key={i} style={{ minHeight: '6.5rem' }}>
              <div className={`${styles.shimmer} ${styles.kpiLabel}`} style={{ width: '60%' }} />
              <div className={`${styles.shimmer} ${styles.kpiValue}`} style={{ width: '45%' }} />
            </div>
          ))}
        </div>

        {/* Monthly Attendance Records Grid */}
        <div className={styles.table}>
          <div className={`${styles.shimmer} ${styles.tableHead}`} />
          {Array.from({ length: 7 }).map((_, i) => (
            <div className={styles.row} key={i}>
              <div className={`${styles.shimmer} ${styles.cellWide}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cell}`} />
              <div className={`${styles.shimmer} ${styles.cellShort}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. SETTINGS VARIANT
  if (v === 'settings') {
    return (
      <div className={styles.root} role="status" aria-label="Loading settings" aria-live="polite">
        <span className={styles.srOnly}>Loading settings</span>
        <div className={styles.heading}>
          <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '14rem' }} />
          <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '7rem' }} />
        </div>
        <div className={styles.settingsLayout}>
          {/* Vertical Menu Sidebar */}
          <div className={styles.settingsSidebar}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div className={styles.settingsMenuItem} key={i}>
                <div className={`${styles.shimmer} ${styles.settingsMenuIcon}`} />
                <div className={`${styles.shimmer} ${styles.settingsMenuText}`} />
              </div>
            ))}
          </div>

          {/* Right Configuration Cards */}
          <div className={styles.settingsContent}>
            <div className={styles.settingsCard}>
              <div className={`${styles.shimmer} ${styles.formSectionTitle}`} />
              {Array.from({ length: 3 }).map((_, i) => (
                <div className={styles.settingsRow} key={i}>
                  <div className={styles.settingsRowMeta}>
                    <div className={`${styles.shimmer} ${styles.settingsRowTitle}`} />
                    <div className={`${styles.shimmer} ${styles.settingsRowDesc}`} />
                  </div>
                  <div className={`${styles.shimmer} ${styles.settingsToggle}`} />
                </div>
              ))}
            </div>
            <div className={styles.settingsCard}>
              <div className={`${styles.shimmer} ${styles.formSectionTitle}`} style={{ width: '10rem' }} />
              <div className={styles.formGrid2}>
                <div className={styles.formField}>
                  <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                  <div className={`${styles.shimmer} ${styles.fieldInput}`} />
                </div>
                <div className={styles.formField}>
                  <div className={`${styles.shimmer} ${styles.fieldLabel}`} />
                  <div className={`${styles.shimmer} ${styles.fieldInput}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 7. CHECKLIST & DELEGATION VARIANT
  if (v === 'checklist' || v === 'delegation') {
    return (
      <div className={styles.root} role="status" aria-label="Loading checklist" aria-live="polite">
        <span className={styles.srOnly}>Loading task checklist</span>
        <div className={styles.heading}>
          <div className={`${styles.shimmer} ${styles.title}`} style={{ width: '15rem' }} />
          <div className={`${styles.shimmer} ${styles.action}`} style={{ width: '9rem' }} />
        </div>

        {/* Stage / Period Filter Tabs */}
        <div className={styles.tabsBar}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div className={`${styles.shimmer} ${styles.tabItem}`} key={i} />
          ))}
        </div>

        {/* Progress Bar Card */}
        <div className={styles.progressCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className={`${styles.shimmer}`} style={{ width: '8rem', height: '1rem' }} />
            <div className={`${styles.shimmer}`} style={{ width: '3rem', height: '1rem' }} />
          </div>
          <div className={`${styles.shimmer} ${styles.progressBar}`} />
        </div>

        {/* Task Items List */}
        <div className={styles.taskList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div className={styles.taskItem} key={i}>
              <div className={`${styles.shimmer} ${styles.taskCheck}`} />
              <div className={styles.taskBody}>
                <div className={`${styles.shimmer} ${styles.taskTitle}`} />
                <div className={styles.taskMeta}>
                  <div className={`${styles.shimmer} ${styles.taskTag}`} />
                  <div className={`${styles.shimmer} ${styles.taskTag}`} style={{ width: '5.5rem' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 8. TABLE VARIANT (Default for LeadTable, Party Master, Teams, Users, Reports)
  return (
    <div className={styles.root} role="status" aria-label="Loading table content" aria-live="polite">
      <span className={styles.srOnly}>Loading table content</span>
      <div className={styles.heading}>
        <div className={`${styles.shimmer} ${styles.title}`} />
        <div className={`${styles.shimmer} ${styles.action}`} />
      </div>
      <div className={styles.filters}>
        <div className={`${styles.shimmer} ${styles.search}`} />
        <div className={`${styles.shimmer} ${styles.filter}`} />
        <div className={`${styles.shimmer} ${styles.filter}`} />
        <div className={`${styles.shimmer} ${styles.filter}`} />
      </div>
      <div className={styles.table}>
        <div className={`${styles.shimmer} ${styles.tableHead}`} />
        {Array.from({ length: 8 }).map((_, index) => (
          <div className={styles.row} key={index}>
            <div className={`${styles.shimmer} ${styles.cellWide}`} />
            <div className={`${styles.shimmer} ${styles.cell}`} />
            <div className={`${styles.shimmer} ${styles.cell}`} />
            <div className={`${styles.shimmer} ${styles.cellShort}`} />
          </div>
        ))}
      </div>
      <div className={styles.paginationBar}>
        <div className={`${styles.shimmer}`} style={{ width: '8rem', height: '1.2rem' }} />
        <div className={styles.pagePills}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div className={`${styles.shimmer} ${styles.pagePill}`} key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
