const DAY = 86_400_000;
const IST = 'Asia/Kolkata';
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: IST });
const dateLabel = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeLabel = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
});

const normalize = value => String(value ?? '').trim().toLowerCase();
const stageNumber = stage => /^S\d{2}$/.test(stage) ? Number(stage.slice(1)) : 0;
const openingCount = position => {
  const value = Number(position.openings);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
};
const pct = (count, total) => total ? Math.round(100 * count / total) : null;

function dateStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00+05:30`);
  return Number.isFinite(time) && dateKey.format(time) === value ? time : NaN;
}

function timestamp(value) {
  if (!value || typeof value !== 'string') return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateStart(value);
  const iso = value.replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(iso) ? iso : `${iso}+05:30`);
}

export function recruiterDateRange(preset, customStart = '', customEnd = '', now = Date.now()) {
  const today = dateKey.format(now);
  const todayStart = dateStart(today);
  const shift = days => dateKey.format(todayStart + days * DAY);
  const mondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const firstThisMonth = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = dateKey.format(dateStart(firstThisMonth) - DAY);
  const presets = {
    all: ['', '', 'All Time'],
    today: [today, today, 'Today'],
    yesterday: [shift(-1), shift(-1), 'Yesterday'],
    this_week: [shift(-mondayOffset), today, 'This Week'],
    last_week: [shift(-mondayOffset - 7), shift(-mondayOffset - 1), 'Last Week'],
    this_month: [firstThisMonth, today, 'This Month'],
    last_month: [`${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd, 'Last Month'],
    custom: [customStart || today, customEnd || today, 'Custom Range']
  };
  const [startDate, endDate, label] = presets[preset] || presets.today;
  return {
    startDate, endDate, label,
    fullLabel: startDate ? `${label} (${startDate === endDate ? startDate : `${startDate} → ${endDate}`})` : label,
    start: startDate ? dateStart(startDate) : -Infinity,
    end: endDate ? dateStart(endDate) + DAY : Infinity
  };
}

export function inRecruiterRange(value, { start, end }) {
  const time = timestamp(value);
  return time >= start && time < end;
}

function parseResult(value) {
  const text = normalize(value);
  if (!text) return null;
  if (/\b(?:fail(?:ed)?|not (?:passed|cleared)|unsuccessful)\b/.test(text)) return { passed: false, score: null };
  if (/^(?:(?:skill|technical|machine) )?(?:test )?(?:pass(?:ed)?|cleared|successful)[.!]?$/.test(text)) return { passed: true, score: null };
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?)|%)?$/);
  if (!match) return null;
  const earned = Number(match[1]);
  const maximum = Number(match[2] ?? 100);
  if (maximum <= 0 || earned > maximum) return null;
  const score = earned / maximum * 100;
  return { passed: score >= 50, score };
}

export function candidateEvaluation(candidate) {
  const rating = [candidate.interview_rating, candidate.evaluation?.interview_rating]
    .map(value => /^\d+(?:\.\d+)?$/.test(normalize(value)) ? Number(value) : NaN)
    .find(value => value >= 1 && value <= 5) ?? null;
  const status = normalize(candidate.candidate_status);
  const result = parseResult(candidate.test_results);
  const technical = parseResult(candidate.technical_score) ?? parseResult(candidate.evaluation?.technical_score);
  const recordedStatus = status === 'test passed' ? true : status === 'test failed' ? false : null;
  return { rating, testPassed: recordedStatus ?? result?.passed ?? technical?.passed ?? null, testScore: technical?.score ?? result?.score ?? null };
}

function joiningTime(candidate) {
  return timestamp(candidate.actual_joining_date);
}

export function candidateJoined(candidate, now = Date.now()) {
  const status = normalize(candidate.candidate_status);
  if (/^(?:not joined|no[ -]show)$/.test(status)) return false;
  const date = joiningTime(candidate);
  if (Number.isFinite(date)) return date <= now;
  // The standard progression requires a recorded join before Document Collection.
  return status === 'joined' || stageNumber(candidate.current_stage) >= 10;
}

function activeCandidate(candidate) {
  const stage = stageNumber(candidate.current_stage);
  return stage >= 2 && stage <= 8 && !rejectedCandidate(candidate);
}

function rejectedCandidate(candidate) {
  return /\b(?:reject(?:ed)?|fail(?:ed)?|drop(?:ped)?|declin(?:ed|e)|withdrawn|no[ -]show|not joined)\b/.test(normalize(candidate.candidate_status));
}

export function recruiterDirectory(recruiters, positions, candidates) {
  const directory = new Map();
  const aliases = new Map();
  for (const recruiter of recruiters) {
    const name = recruiter.emp_name || recruiter.name || recruiter.email;
    const key = normalize(recruiter.email || recruiter.emp_id || name);
    if (!key || directory.has(key)) continue;
    directory.set(key, { key, name, branch: recruiter.branch_code || recruiter.work_location_name });
    for (const value of [recruiter.email, recruiter.emp_id, recruiter.emp_name, recruiter.name].map(normalize).filter(Boolean)) {
      if (aliases.has(value) && aliases.get(value) !== key) aliases.set(value, null);
      else aliases.set(value, key);
    }
  }
  const resolve = value => {
    const key = normalize(value);
    return !key || ['all', 'unassigned'].includes(key) ? '' : aliases.get(key) || key;
  };
  for (const value of [...positions.map(row => row.recruiter_assigned), ...candidates.map(row => row.created_by)]) {
    const key = resolve(value);
    if (key && !directory.has(key)) directory.set(key, { key, name: String(value).trim() });
  }
  return { directory, resolve };
}

export function scopeRecruiterDashboard(positions, candidates, filters, resolve) {
  const scopedPositions = positions.filter(position => {
    const branch = position.branch_code || position.workspace_branch_code;
    return (filters.branch === 'All' || branch === filters.branch) &&
      (filters.department === 'All' || (position.department || 'General') === filters.department) &&
      (filters.position === 'All' || position.id === filters.position) &&
      (filters.recruiter === 'All' || resolve(position.recruiter_assigned) === filters.recruiter);
  });
  const positionById = new Map(scopedPositions.map(position => [position.id, position]));
  return { positions: scopedPositions, candidates: candidates.filter(candidate => positionById.has(candidate.position_id)), positionById };
}

function candidateMatches(candidate, status, delayed) {
  if (status === 'All') return true;
  if (status === 'active_pipeline') return activeCandidate(candidate);
  if (status === 'rejected') return rejectedCandidate(candidate);
  if (status === 'delayed') return delayed.has(candidate.position_id) && !candidateJoined(candidate);
  return candidate.current_stage === status;
}

export function filterDashboardCandidates(candidates, status, delayed) {
  return candidates.filter(candidate => candidateMatches(candidate, status, delayed));
}

function groupCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.position_id)) groups.set(candidate.position_id, []);
    groups.get(candidate.position_id).push(candidate);
  }
  return groups;
}

function emptyTotals() {
  return { requirements: 0, openings: 0, joined: 0, filledOpenings: 0, fulfilled: 0, overdue: 0, late: 0, onTime: 0, eligible: 0 };
}

function addRequirement(totals, row) {
  totals.requirements++;
  totals.openings += row.openings;
  totals.joined += row.joinedCount;
  totals.filledOpenings += Math.min(row.openings, row.joinedCount);
  totals.fulfilled += Number(row.isFulfilled);
  totals.overdue += Number(row.slaStatus === 'Overdue');
  totals.late += Number(row.slaStatus === 'Fulfilled late');
  totals.onTime += Number(row.slaStatus === 'Fulfilled on time' || row.slaStatus === 'Within deadline');
  totals.eligible += Number(row.slaStatus !== 'Unavailable');
  return totals;
}

export function scoreRequirements(positions, candidates, now = Date.now()) {
  const byPosition = groupCandidates(candidates);
  return positions.map(position => {
    const pool = byPosition.get(position.id) || [];
    const openings = openingCount(position);
    const hires = pool.filter(candidate => candidateJoined(candidate, now));
    const joinedCount = hires.length;
    const isFulfilled = joinedCount >= openings;
    const deadlineDay = dateStart(position.deadline_date);
    const deadline = deadlineDay + DAY;
    const verifiedHires = hires.map(joiningTime).filter(Number.isFinite).sort((a, b) => a - b);
    const onTimeHires = verifiedHires.filter(date => date < deadline).length;
    const undatedHires = joinedCount - verifiedHires.length;
    let slaStatus = 'Unavailable';
    if (Number.isFinite(deadline)) {
      if (!isFulfilled) slaStatus = now >= deadline ? 'Overdue' : 'Within deadline';
      else if (onTimeHires >= openings) slaStatus = 'Fulfilled on time';
      else if (onTimeHires + undatedHires < openings) slaStatus = 'Fulfilled late';
    }
    const screenedCount = pool.filter(candidate => stageNumber(candidate.current_stage) > 2 ||
      ['resume selected', 'resume rejected'].includes(normalize(candidate.candidate_status))).length;
    const interviewedCount = pool.filter(candidate => {
      const stage = stageNumber(candidate.current_stage);
      const status = normalize(candidate.candidate_status);
      return stage > 3 || (stage === 3 && ['interview cleared', 'interview rejected'].includes(status)) ||
        candidateEvaluation(candidate).rating !== null;
    }).length;
    const fillScore = Math.min(joinedCount / openings, 1) * 50;
    const pipelineScore = Math.min(30, interviewedCount * 10 + screenedCount * 3);
    const slaScore = slaStatus === 'Unavailable' ? null : ['Fulfilled on time', 'Within deadline'].includes(slaStatus) ? 20 : 0;
    const totalScore = Math.round(fillScore + pipelineScore + (slaScore ?? 0));
    return {
      ...position, openings, joinedCount, isFulfilled, screenedCount, interviewedCount, totalApplicants: pool.length,
      totalScore, fillScore: Math.round(fillScore * 10) / 10, pipelineScore, slaScore, slaStatus,
      fulfillmentPct: pct(Math.min(joinedCount, openings), openings),
      deadline: Number.isFinite(deadlineDay) ? deadlineDay : null,
      deadlineLabel: Number.isFinite(deadlineDay) ? dateLabel.format(deadlineDay) : 'No deadline',
      daysRemaining: Number.isFinite(deadlineDay) ? (deadlineDay - dateStart(dateKey.format(now))) / DAY : null
    };
  });
}

export function filterRequirementScores(rows, { search, fulfillment, sort }, formatCode) {
  const query = normalize(search);
  const matches = rows.filter(row => {
    if (query && ![formatCode(row), row.title, row.department, row.recruiter_assigned].some(value => normalize(value).includes(query))) return false;
    if (fulfillment === 'fulfilled') return row.isFulfilled;
    if (fulfillment === 'in_progress') return !row.isFulfilled && row.slaStatus !== 'Overdue';
    if (fulfillment === 'unfilled') return row.joinedCount === 0;
    if (fulfillment === 'overdue') return row.slaStatus === 'Overdue';
    if (fulfillment === 'late') return row.slaStatus === 'Fulfilled late';
    if (fulfillment === 'unknown') return row.slaStatus === 'Unavailable';
    return true;
  });
  const byTitle = (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')) || String(a.id).localeCompare(String(b.id));
  const comparators = {
    score_desc: (a, b) => b.totalScore - a.totalScore,
    score_asc: (a, b) => a.totalScore - b.totalScore,
    openings_desc: (a, b) => b.openings - a.openings,
    deadline_near: (a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity),
    title_asc: byTitle
  };
  return matches.sort((a, b) => (comparators[sort] || comparators.score_desc)(a, b) || byTitle(a, b));
}

export function summarizeRequirements(rows) {
  const totals = rows.reduce(addRequirement, emptyTotals());
  return { ...totals, fulfillment: pct(totals.filledOpenings, totals.openings), sla: pct(totals.onTime, totals.eligible) };
}

export function dashboardOverview(positions, candidates, scores, resolve, directory, now = Date.now()) {
  const stages = new Map();
  const departments = new Map();
  const recruiters = new Map();
  const positionById = new Map(positions.map(position => [position.id, position]));
  const positionStages = new Map();
  const getRecruiter = value => {
    const key = resolve(value) || 'unassigned';
    if (!recruiters.has(key)) recruiters.set(key, { key, name: directory.get(key)?.name || 'Unassigned', requirements: 0, openings: 0, candidates: 0, active: 0, joined: 0, ratings: [] });
    return recruiters.get(key);
  };
  for (const score of scores) {
    const department = score.department || 'General';
    if (!departments.has(department)) departments.set(department, emptyTotals());
    addRequirement(departments.get(department), score);
    const recruiter = getRecruiter(score.recruiter_assigned);
    recruiter.requirements++;
    recruiter.openings += score.openings;
    const count = positionStages.get(score.status) || { requirements: 0, openings: 0 };
    positionStages.set(score.status, { requirements: count.requirements + 1, openings: count.openings + score.openings });
  }
  let joined = 0, active = 0, interviews = 0, cleared = 0, testResults = 0, passed = 0;
  let finalDecisions = 0, confirmed = 0, loiDecisions = 0, accepted = 0;
  const evaluated = [];
  for (const candidate of candidates) {
    const stage = candidate.current_stage;
    stages.set(stage, (stages.get(stage) || 0) + 1);
    const position = positionById.get(candidate.position_id);
    const recruiter = getRecruiter(position?.recruiter_assigned);
    const evaluation = candidateEvaluation(candidate);
    const status = normalize(candidate.candidate_status);
    const finalStatus = normalize(candidate.ed_approval_status);
    const loiStatus = normalize(candidate.loi_status);
    const isJoined = candidateJoined(candidate, now);
    const isActive = activeCandidate(candidate);
    joined += Number(isJoined);
    active += Number(isActive);
    recruiter.candidates++;
    recruiter.active += Number(isActive);
    recruiter.joined += Number(isJoined);
    if (evaluation.rating !== null) recruiter.ratings.push(evaluation.rating);
    if (evaluation.rating !== null || evaluation.testPassed !== null) evaluated.push({ candidate, ...evaluation });
    if (['interview cleared', 'interview rejected'].includes(status) || stageNumber(stage) > 3) {
      interviews++;
      if (status === 'interview cleared' || stageNumber(stage) > 3) cleared++;
    }
    if (evaluation.testPassed !== null) {
      testResults++;
      passed += Number(evaluation.testPassed);
    }
    if (['approved', 'rejected'].includes(finalStatus) || ['final confirmed', 'final rejected'].includes(status)) {
      finalDecisions++;
      if (finalStatus === 'approved' || status === 'final confirmed') confirmed++;
    }
    if (['accepted', 'declined', 'rejected'].includes(loiStatus) || ['loi accepted', 'loi declined'].includes(status)) {
      loiDecisions++;
      if (loiStatus === 'accepted' || status === 'loi accepted') accepted++;
    }
  }
  const ratings = evaluated.map(row => row.rating).filter(value => value !== null);
  evaluated.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.testScore ?? -1) - (a.testScore ?? -1) ||
    (timestamp(b.candidate.created_at) || 0) - (timestamp(a.candidate.created_at) || 0));
  return { stages, positionStages, departments, recruiters: [...recruiters.values()].sort((a, b) => b.candidates - a.candidates),
    joined, active, evaluated: evaluated.slice(0, 5), ratings: ratings.length,
    averageRating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : null,
    rates: [pct(cleared, interviews), pct(passed, testResults), pct(confirmed, finalDecisions), pct(accepted, loiDecisions)] };
}

function classifyNote(text) {
  const status = text.match(/^Status (?:set|updated) to (.+?)(?: in stage (S\d{2}))?$/i);
  if (status) {
    const value = normalize(status[1]);
    if ((!status[2] || status[2] === 'S03') && /^interview (?:cleared|rejected)$/.test(value)) return { type: 'interview', label: status[1], stage: 'S03' };
    if ((!status[2] || status[2] === 'S04') && /^test (?:passed|failed)$/.test(value)) return { type: 'test', label: status[1], stage: 'S04' };
    return { type: 'activity', label: 'Status updated', stage: status[2] };
  }
  const movement = text.match(/^(?:\S*\s*ADMIN STAGE OVERRIDE:\s*)?Stage changed (?:from S\d{2} )?to (S\d{2})\b/i);
  if (movement) return { type: 'activity', label: 'Stage changed', stage: movement[1] };
  return { type: 'activity', label: 'Note recorded' };
}

export function dashboardActivity(candidates, positionById, notes, range, now = Date.now()) {
  const candidatesById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const events = [];
  const unique = new Set();
  const addEvent = (id, candidate, value, { type, label, stage }, actor) => {
    if (unique.has(id) || !inRecruiterRange(value, range)) return;
    unique.add(id);
    const time = timestamp(value);
    const position = positionById.get(candidate.position_id);
    events.push({ id, type, label, stage, time, candidate, position, actor: actor || position?.recruiter_assigned || 'Unassigned',
      timeLabel: type === 'joined' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateLabel.format(time) : dateTimeLabel.format(time) });
  };
  for (const candidate of candidates) {
    addEvent(`sourced:${candidate.id}`, candidate, candidate.created_at, { type: 'sourced', label: 'Candidate sourced', stage: 'S02' }, candidate.created_by);
    if (candidateJoined(candidate, now)) {
      addEvent(`joined:${candidate.id}`, candidate, candidate.actual_joining_date, { type: 'joined', label: 'Joined', stage: 'S09' });
    }
  }
  for (const note of notes) {
    const candidate = candidatesById.get(note.candidate_id);
    if (!candidate) continue;
    const text = String(note.note_text ?? '').trim();
    if (!text || /^(?:Candidate Resume Filtered and Registered|Candidate registered|Candidate added)\b/i.test(text) ||
      text.includes('applied online') || text.includes('Application Reference ID')) continue;
    addEvent(`note:${note.id}`, candidate, note.created_at, classifyNote(text), note.created_by);
  }
  events.sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
  const counts = { sourced: 0, activity: 0, interview: 0, test: 0, joined: 0 };
  for (const event of events) counts[event.type]++;
  return { counts, events, loggedActions: counts.activity + counts.interview + counts.test };
}
