import { supabase } from './supabase-config.js';

const reviewPanel = document.getElementById('reviewPanel');
const reviewLink = document.getElementById('reviewClientLink');

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function clientUrl(rawToken) {
  const url = new URL('./', location.href);
  url.searchParams.set('token', rawToken);
  return url.href;
}

function tokenFromFreshlyCreatedLink() {
  const input = document.getElementById('shareUrl');
  if (!input?.value) return null;
  try {
    return new URL(input.value).searchParams.get('token');
  } catch {
    return null;
  }
}

async function ensureClientLink(engagementId) {
  if (!engagementId) return null;

  const { data: engagement, error } = await supabase
    .from('engagements')
    .select('id, public_token, public_token_hash')
    .eq('id', engagementId)
    .single();

  if (error) throw error;

  let rawToken = engagement.public_token;
  if (!rawToken) {
    rawToken = tokenFromFreshlyCreatedLink() || makeToken();
    const { error: updateError } = await supabase
      .from('engagements')
      .update({
        public_token: rawToken,
        public_token_hash: await hash(rawToken),
        updated_at: new Date().toISOString(),
      })
      .eq('id', engagementId);
    if (updateError) throw updateError;
  }

  return clientUrl(rawToken);
}

async function hydrateReviewLink() {
  const engagementId = reviewPanel?.dataset.engagement;
  if (!engagementId || !reviewLink) return;

  reviewLink.hidden = false;
  reviewLink.textContent = 'Preparing client link…';
  reviewLink.removeAttribute('href');

  try {
    const href = await ensureClientLink(engagementId);
    reviewLink.href = href;
    reviewLink.textContent = 'Open client link';
    reviewLink.title = 'Open the live client questionnaire in a new tab';
  } catch (error) {
    console.error(error);
    reviewLink.textContent = 'Could not create client link';
    reviewLink.hidden = false;
  }
}

if (reviewPanel) {
  const observer = new MutationObserver(() => hydrateReviewLink());
  observer.observe(reviewPanel, { attributes: true, attributeFilter: ['data-engagement', 'hidden'] });

  document.addEventListener('click', event => {
    if (event.target.closest('.engagement-card')) {
      setTimeout(hydrateReviewLink, 50);
    }
  }, true);
}

// If a review is already open when this module loads, restore its link immediately.
hydrateReviewLink();
