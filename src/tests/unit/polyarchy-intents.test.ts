// Unit tests for the EntraPulse Polyarchy intent routing, exposed-tools allowlist,
// and UI-resource resolution.
import { resolveUiResourceUri } from '../../mcp/types';
import {
  detectPolyarchyAppIntent,
  detectPolyarchyReportIntent,
  POLYARCHY_EXPOSED_TOOLS,
  POLYARCHY_AUTH_MUTATING_TOOLS,
  POLYARCHY_TOOL_DEFINITION_UI_RESOURCES,
  POLYARCHY_PINNED_PACKAGE,
  POLYARCHY_NPX_ARGS,
  POLYARCHY_UI_RESOURCE,
} from '../../mcp/constants';

describe('detectPolyarchyAppIntent', () => {
  it('opens on explicit polyarchy requests (focus = /me, no search arg)', () => {
    for (const q of ['open the polyarchy', 'show me the polyarchy', 'polyarchy', 'show the identity polyarchy']) {
      expect(detectPolyarchyAppIntent(q)).toEqual({
        tool: 'visualize-identity',
        resourceUri: POLYARCHY_UI_RESOURCE,
        args: {},
      });
    }
  });

  it('opens on self-focused visualization requests without a search arg', () => {
    for (const q of ['visualize my identity', 'visualise my relationships', 'visualize my org chart', 'visualize the identity']) {
      expect(detectPolyarchyAppIntent(q)).toEqual({
        tool: 'visualize-identity',
        resourceUri: POLYARCHY_UI_RESOURCE,
        args: {},
      });
    }
  });

  it('captures the subject as a search arg when the query names someone else', () => {
    expect(detectPolyarchyAppIntent("visualize Megan's relationships")).toEqual({
      tool: 'visualize-identity',
      resourceUri: POLYARCHY_UI_RESOURCE,
      args: { search: 'Megan' },
    });
    expect(detectPolyarchyAppIntent('visualise Rebecca Brown identity')).toEqual({
      tool: 'visualize-identity',
      resourceUri: POLYARCHY_UI_RESOURCE,
      args: { search: 'Rebecca Brown' },
    });
    expect(detectPolyarchyAppIntent('identity graph for Adele Vance')).toEqual({
      tool: 'visualize-identity',
      resourceUri: POLYARCHY_UI_RESOURCE,
      args: { search: 'Adele Vance' },
    });
    expect(detectPolyarchyAppIntent('relationship map of darren@contoso.com')).toEqual({
      tool: 'visualize-identity',
      resourceUri: POLYARCHY_UI_RESOURCE,
      args: { search: 'darren@contoso.com' },
    });
  });

  it('does NOT hijack ordinary Graph queries or unrelated "visualize" requests', () => {
    for (const q of [
      'how many users do we have',
      'list all groups',
      'visualize trends in sign-ins',
      'visualize the data as a table',
      'what permissions do I have',
      '',
    ]) {
      expect(detectPolyarchyAppIntent(q)).toBeNull();
    }
  });
});

describe('detectPolyarchyReportIntent', () => {
  it('runs a report on a named person via for/of/on phrasing', () => {
    expect(detectPolyarchyReportIntent('identity report for Megan')).toEqual({
      tool: 'polyarchy-report',
      args: { search: 'Megan' },
    });
    expect(detectPolyarchyReportIntent('run a polyarchy report on Adele Vance')).toEqual({
      tool: 'polyarchy-report',
      args: { search: 'Adele Vance' },
    });
    expect(detectPolyarchyReportIntent('relationship report of darren@contoso.com')).toEqual({
      tool: 'polyarchy-report',
      args: { search: 'darren@contoso.com' },
    });
  });

  it('reports on the signed-in user when no subject is named', () => {
    expect(detectPolyarchyReportIntent('give me an identity report')).toEqual({
      tool: 'polyarchy-report',
      args: {},
    });
    expect(detectPolyarchyReportIntent('access report')).toEqual({
      tool: 'polyarchy-report',
      args: {},
    });
  });

  it('maps the relationship noun to report dimensions', () => {
    expect(detectPolyarchyReportIntent("summarize Rebecca's access")).toEqual({
      tool: 'polyarchy-report',
      args: { search: 'Rebecca', dimensions: ['roles', 'applications'] },
    });
    expect(detectPolyarchyReportIntent("report on Adele's group memberships")).toEqual({
      tool: 'polyarchy-report',
      args: { search: 'Adele', dimensions: ['groups'] },
    });
    expect(detectPolyarchyReportIntent('summarize my access')).toEqual({
      tool: 'polyarchy-report',
      args: { dimensions: ['roles', 'applications'] },
    });
  });

  it('does NOT hijack unrelated report/summary asks or ordinary queries', () => {
    for (const q of [
      'report a bug',
      'summarize this conversation',
      'summarize the sign-in logs',
      'how many users do we have',
      'visualize my identity', // visual intent, not a report
      '',
    ]) {
      expect(detectPolyarchyReportIntent(q)).toBeNull();
    }
  });

  it('wins over the visual intent for "polyarchy report" phrasing (service checks report first)', () => {
    // Both detectors match this phrase — EnhancedLLMService must call the report
    // detector first, so pin that both do match to document the ordering contract.
    expect(detectPolyarchyReportIntent('polyarchy report for Megan')?.tool).toBe('polyarchy-report');
    expect(detectPolyarchyAppIntent('polyarchy report for Megan')?.tool).toBe('visualize-identity');
  });
});

describe('Polyarchy constants', () => {
  it('pins the npm package version', () => {
    expect(POLYARCHY_PINNED_PACKAGE).toMatch(/^entrapulse-polyarchy@\d+\.\d+\.\d+$/);
    expect(POLYARCHY_NPX_ARGS).toEqual(['-y', POLYARCHY_PINNED_PACKAGE]);
  });

  it('exposes the opener, report, search, and diagnostics tools to the LLM', () => {
    expect(POLYARCHY_EXPOSED_TOOLS).toEqual(['visualize-identity', 'polyarchy-report', 'polyarchy-search', 'get-auth-status']);
    // The token channel belongs to EntraPulse and is never LLM- or iframe-callable.
    expect(POLYARCHY_EXPOSED_TOOLS).not.toContain('set-access-token');
    expect(POLYARCHY_AUTH_MUTATING_TOOLS).toContain('set-access-token');
  });
});

describe('resolveUiResourceUri for Polyarchy', () => {
  it('falls back to the tool-definition map when the result carries no _meta', () => {
    const result = { content: [{ type: 'text', text: 'Polyarchy opened' }], structuredContent: { focus: 'me' } };
    expect(resolveUiResourceUri('visualize-identity', result, POLYARCHY_TOOL_DEFINITION_UI_RESOURCES)).toBe(POLYARCHY_UI_RESOURCE);
  });

  it('prefers the result _meta when present', () => {
    const result = { _meta: { ui: { resourceUri: POLYARCHY_UI_RESOURCE } } };
    expect(resolveUiResourceUri('visualize-identity', result, POLYARCHY_TOOL_DEFINITION_UI_RESOURCES)).toBe(POLYARCHY_UI_RESOURCE);
  });

  it('returns undefined for tools with no UI link', () => {
    const result = { content: [{ type: 'text', text: 'ok' }] };
    expect(resolveUiResourceUri('get-auth-status', result, POLYARCHY_TOOL_DEFINITION_UI_RESOURCES)).toBeUndefined();
  });
});
