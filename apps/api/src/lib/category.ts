/**
 * YNAB 4's rules for the envelopes themselves: the ids an authored category and
 * group are minted with, and which groups belong to YNAB 4 rather than to the
 * user. Deliberately free of database and tRPC imports so the rules can be
 * read, and tested, on their own.
 */

/**
 * The prefix on the groups YNAB 4 keeps for itself: __Hidden__, __Income__,
 * __Internal__ and __PreYNABDebtMaster__. The importer classes a group by it,
 * and the minters below are shaped so that nothing authored here can ever be
 * taken for one.
 */
export const isSystemGroupYnabId = (ynabId: string): boolean =>
  ynabId.startsWith("MasterCategory/__");

/**
 * The ids an authored category and group carry. YNAB 4 names both with a bare
 * uuid, so nothing imported has this shape; prefixed the way every other
 * authored id is, which keeps one made here telling about where it came from.
 */
export const mintCategoryYnabId = (): string => `Category/${crypto.randomUUID()}`;
export const mintCategoryGroupYnabId = (): string =>
  `MasterCategory/${crypto.randomUUID()}`;
