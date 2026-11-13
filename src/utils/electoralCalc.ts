export interface CalcCandidacy {
  id: string;
  acronym: string;
  name: string;
  color: string;
  votes: number;
}

export interface CalcCollege {
  id: string;
  name: string;
  census: number;
  seats: number;
  candidacies: CalcCandidacy[];
  blankVotes: number;
  nullVotes: number;
  seniorityWinnerId: string | null;
}

export interface CalcCandidacyResult {
  candidacy: CalcCandidacy;
  pctOfValid: number;
  meetsThreshold: boolean;
  exactRatio: number;
  integerSeats: number;
  remainderFraction: number;
  remainderVotes: number;
  remainderSeat: number;
  seats: number;
  tiedForLastRemainder: boolean;
}

export interface CalcSummary {
  collegeId: string;
  collegeName: string;
  census: number;
  totalSeats: number;
  thresholdPct: number;
  totalVoters: number;
  abstention: number;
  participationPct: number;
  candidacyVotesTotal: number;
  blankVotes: number;
  nullVotes: number;
  validVotes: number;
  admittedVotesTotal: number;
  electoralQuotient: number;
  minVotesForThreshold: number;
  censusExceeded: boolean;
  assignedByQuotient: number;
  remainingSeatsCount: number;
  assignedSeats: number;
  hasTieOnLastSeat: boolean;
  tiedCandidacyIds: string[];
  results: CalcCandidacyResult[];
}

export interface CommitteeAcronymRow {
  acronym: string;
  name: string;
  color: string;
  totalVotes: number;
  totalSeats: number;
  pctOfValid: number;
  seatsByCollege: Record<string, number>;
  votesByCollege: Record<string, number>;
}

export interface CommitteeSummary {
  totalCensus: number;
  totalSeats: number;
  totalVoters: number;
  totalAbstention: number;
  participationPct: number;
  totalValidVotes: number;
  totalBlankVotes: number;
  totalNullVotes: number;
  assignedSeats: number;
  completedCollegesCount: number;
  totalCollegesCount: number;
  scrutinyProgressPct: number;
  hasAnyTie: boolean;
  hasCensusExceeded: boolean;
  collegeSummaries: CalcSummary[];
  combinedRows: CommitteeAcronymRow[];
}

export function suggestLegalSeats(workers: number): number {
  if (workers <= 0) return 1;
  if (workers <= 30) return 1;
  if (workers <= 49) return 3;
  if (workers <= 100) return 5;
  if (workers <= 250) return 9;
  if (workers <= 500) return 13;
  if (workers <= 750) return 17;
  if (workers <= 1000) return 21;
  const extraBlocks = Math.ceil((workers - 1000) / 1000);
  return Math.min(75, 21 + extraBlocks * 2);
}

/**
 * Reparte proporcionalmente el número total de puestos del comité entre los colegios
 * según el censo de cada colegio (cociente y mayor resto, Art. 71.1 ET).
 */
export function allocateCollegeSeatsByCensus(
  colleges: Array<{ id: string; census: number }>,
  totalCommitteeSeats: number
): Record<string, number> {
  const result: Record<string, number> = {};
  if (colleges.length === 0) return result;
  if (colleges.length === 1) {
    result[colleges[0].id] = Math.max(1, totalCommitteeSeats);
    return result;
  }

  const totalCensus = colleges.reduce((acc, c) => acc + Math.max(0, Math.floor(c.census)), 0);
  if (totalCensus <= 0) {
    const base = Math.floor(totalCommitteeSeats / colleges.length);
    let rem = totalCommitteeSeats % colleges.length;
    for (const c of colleges) {
      result[c.id] = Math.max(1, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem--;
    }
    return result;
  }

  const items = colleges.map((c, idx) => {
    const cen = Math.max(0, Math.floor(c.census));
    const scaled = cen * totalCommitteeSeats;
    const integer = Math.floor(scaled / totalCensus);
    const rem = scaled % totalCensus;
    return { id: c.id, integer, rem, idx };
  });

  const assigned = items.reduce((acc, i) => acc + i.integer, 0);
  const leftover = Math.max(0, totalCommitteeSeats - assigned);

  const sortedForRem = [...items].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return a.idx - b.idx;
  });

  for (const item of items) {
    result[item.id] = item.integer;
  }
  for (let i = 0; i < Math.min(leftover, sortedForRem.length); i++) {
    result[sortedForRem[i].id] += 1;
  }

  return result;
}

/**
 * Cálculo por colegio conforme al artículo 12 del Real Decreto 1844/1994, de 9 de septiembre.
 */
export function calculateCollegeProportional(
  college: CalcCollege,
  thresholdPct: number
): CalcSummary {
  const census = Math.max(0, Math.floor(college.census));
  const totalSeats = Math.max(1, Math.min(75, Math.floor(college.seats)));
  const cleanThreshold = Math.max(0, Math.min(25, thresholdPct));
  const blankVotes = Math.max(0, Math.floor(college.blankVotes));
  const nullVotes = Math.max(0, Math.floor(college.nullVotes));

  const cleanCandidacies = college.candidacies.map((c) => ({
    ...c,
    votes: Math.max(0, Math.floor(c.votes)),
  }));

  const candidacyVotesTotal = cleanCandidacies.reduce((acc, c) => acc + c.votes, 0);
  const validVotes = candidacyVotesTotal + blankVotes;
  const totalVoters = validVotes + nullVotes;
  const abstention = Math.max(0, census - totalVoters);
  const participationPct = census > 0 ? (totalVoters / census) * 100 : 0;
  const censusExceeded = census > 0 && totalVoters > census;

  const thresholdFraction = cleanThreshold / 100;
  const minVotesForThreshold = validVotes > 0 ? Math.ceil(validVotes * thresholdFraction) : 0;

  const admittedFlag = new Map<string, boolean>();
  let admittedVotesTotal = 0;

  for (const c of cleanCandidacies) {
    const meets = validVotes > 0 && c.votes > 0 && c.votes / validVotes >= thresholdFraction;
    admittedFlag.set(c.id, meets);
    if (meets) {
      admittedVotesTotal += c.votes;
    }
  }

  const electoralQuotient =
    admittedVotesTotal > 0 && totalSeats > 0 ? admittedVotesTotal / totalSeats : 0;

  interface WorkingEntry {
    candidacy: CalcCandidacy;
    pctOfValid: number;
    meetsThreshold: boolean;
    exactRatio: number;
    integerSeats: number;
    remainderNumerator: number;
    remainderFraction: number;
    remainderVotes: number;
    remainderSeat: number;
    tiedForLastRemainder: boolean;
    origIdx: number;
  }

  const working: WorkingEntry[] = cleanCandidacies.map((c, origIdx) => {
    const meets = admittedFlag.get(c.id) ?? false;
    const pctOfValid = validVotes > 0 ? (c.votes / validVotes) * 100 : 0;

    if (!meets || admittedVotesTotal <= 0) {
      return {
        candidacy: c,
        pctOfValid,
        meetsThreshold: meets,
        exactRatio: 0,
        integerSeats: 0,
        remainderNumerator: 0,
        remainderFraction: 0,
        remainderVotes: 0,
        remainderSeat: 0,
        tiedForLastRemainder: false,
        origIdx,
      };
    }

    const scaled = c.votes * totalSeats;
    const integerSeats = Math.floor(scaled / admittedVotesTotal);
    const remainderNumerator = scaled % admittedVotesTotal;
    const remainderFraction = remainderNumerator / admittedVotesTotal;
    const exactRatio = c.votes / electoralQuotient;
    const remainderVotes = c.votes - integerSeats * electoralQuotient;

    return {
      candidacy: c,
      pctOfValid,
      meetsThreshold: true,
      exactRatio,
      integerSeats,
      remainderNumerator,
      remainderFraction,
      remainderVotes,
      remainderSeat: 0,
      tiedForLastRemainder: false,
      origIdx,
    };
  });

  const assignedByQuotient = working.reduce((acc, w) => acc + w.integerSeats, 0);
  const remainingSeatsCount =
    admittedVotesTotal > 0 ? Math.max(0, totalSeats - assignedByQuotient) : 0;

  let hasTieOnLastSeat = false;
  let tiedCandidacyIds: string[] = [];

  if (remainingSeatsCount > 0) {
    const admittedSorted = working
      .filter((w) => w.meetsThreshold)
      .sort((a, b) => {
        if (b.remainderNumerator !== a.remainderNumerator) {
          return b.remainderNumerator - a.remainderNumerator;
        }
        if (college.seniorityWinnerId) {
          if (a.candidacy.id === college.seniorityWinnerId) return -1;
          if (b.candidacy.id === college.seniorityWinnerId) return 1;
        }
        return a.origIdx - b.origIdx;
      });

    if (admittedSorted.length > remainingSeatsCount) {
      const lastWinner = admittedSorted[remainingSeatsCount - 1];
      const firstLoser = admittedSorted[remainingSeatsCount];
      if (lastWinner.remainderNumerator === firstLoser.remainderNumerator) {
        hasTieOnLastSeat = true;
        const tiedVal = lastWinner.remainderNumerator;
        tiedCandidacyIds = admittedSorted
          .filter((w) => w.remainderNumerator === tiedVal)
          .map((w) => w.candidacy.id);
        for (const w of admittedSorted) {
          if (w.remainderNumerator === tiedVal) {
            w.tiedForLastRemainder = true;
          }
        }
      }
    }

    for (let i = 0; i < Math.min(remainingSeatsCount, admittedSorted.length); i++) {
      admittedSorted[i].remainderSeat = 1;
    }
  }

  const results: CalcCandidacyResult[] = working
    .map((w) => ({
      candidacy: w.candidacy,
      pctOfValid: w.pctOfValid,
      meetsThreshold: w.meetsThreshold,
      exactRatio: w.exactRatio,
      integerSeats: w.integerSeats,
      remainderFraction: w.remainderFraction,
      remainderVotes: w.remainderVotes,
      remainderSeat: w.remainderSeat,
      seats: w.integerSeats + w.remainderSeat,
      tiedForLastRemainder: w.tiedForLastRemainder,
    }))
    .sort((a, b) => {
      if (b.seats !== a.seats) return b.seats - a.seats;
      return b.candidacy.votes - a.candidacy.votes;
    });

  const assignedSeats = results.reduce((acc, r) => acc + r.seats, 0);

  return {
    collegeId: college.id,
    collegeName: college.name,
    census,
    totalSeats,
    thresholdPct: cleanThreshold,
    totalVoters,
    abstention,
    participationPct,
    candidacyVotesTotal,
    blankVotes,
    nullVotes,
    validVotes,
    admittedVotesTotal,
    electoralQuotient,
    minVotesForThreshold,
    censusExceeded,
    assignedByQuotient,
    remainingSeatsCount,
    assignedSeats,
    hasTieOnLastSeat,
    tiedCandidacyIds,
    results,
  };
}

export function calculateCommitteeSummary(
  colleges: CalcCollege[],
  thresholdPct: number
): CommitteeSummary {
  const collegeSummaries = colleges.map((col) =>
    calculateCollegeProportional(col, thresholdPct)
  );

  const totalCensus = collegeSummaries.reduce((a, s) => a + s.census, 0);
  const totalSeats = collegeSummaries.reduce((a, s) => a + s.totalSeats, 0);
  const totalVoters = collegeSummaries.reduce((a, s) => a + s.totalVoters, 0);
  const totalAbstention = Math.max(0, totalCensus - totalVoters);
  const participationPct = totalCensus > 0 ? (totalVoters / totalCensus) * 100 : 0;
  const totalValidVotes = collegeSummaries.reduce((a, s) => a + s.validVotes, 0);
  const totalBlankVotes = collegeSummaries.reduce((a, s) => a + s.blankVotes, 0);
  const totalNullVotes = collegeSummaries.reduce((a, s) => a + s.nullVotes, 0);
  const assignedSeats = collegeSummaries.reduce((a, s) => a + s.assignedSeats, 0);
  const totalCollegesCount = collegeSummaries.length;
  const completedCollegesCount = collegeSummaries.filter((s) => s.totalVoters > 0).length;
  const scrutinyProgressPct =
    totalCollegesCount > 0 ? (completedCollegesCount / totalCollegesCount) * 100 : 0;
  const hasAnyTie = collegeSummaries.some((s) => s.hasTieOnLastSeat);
  const hasCensusExceeded = collegeSummaries.some((s) => s.censusExceeded);

  // Group results across colleges by normalized acronym
  const byAcronym = new Map<string, CommitteeAcronymRow>();
  for (const summary of collegeSummaries) {
    for (const r of summary.results) {
      const key = (r.candidacy.acronym.trim() || 'LISTA').toUpperCase();
      let row = byAcronym.get(key);
      if (!row) {
        row = {
          acronym: key,
          name: r.candidacy.name || key,
          color: r.candidacy.color,
          totalVotes: 0,
          totalSeats: 0,
          pctOfValid: 0,
          seatsByCollege: {},
          votesByCollege: {},
        };
        byAcronym.set(key, row);
      }
      row.totalVotes += r.candidacy.votes;
      row.totalSeats += r.seats;
      row.seatsByCollege[summary.collegeId] =
        (row.seatsByCollege[summary.collegeId] ?? 0) + r.seats;
      row.votesByCollege[summary.collegeId] =
        (row.votesByCollege[summary.collegeId] ?? 0) + r.candidacy.votes;
    }
  }

  const combinedRows = Array.from(byAcronym.values())
    .map((row) => ({
      ...row,
      pctOfValid: totalValidVotes > 0 ? (row.totalVotes / totalValidVotes) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.totalSeats !== a.totalSeats) return b.totalSeats - a.totalSeats;
      return b.totalVotes - a.totalVotes;
    });

  return {
    totalCensus,
    totalSeats,
    totalVoters,
    totalAbstention,
    participationPct,
    totalValidVotes,
    totalBlankVotes,
    totalNullVotes,
    assignedSeats,
    completedCollegesCount,
    totalCollegesCount,
    scrutinyProgressPct,
    hasAnyTie,
    hasCensusExceeded,
    collegeSummaries,
    combinedRows,
  };
}
