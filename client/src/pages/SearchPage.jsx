import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, BookOpen, FileText, Globe, ArrowLeft, TrendingUp } from 'lucide-react';
import client from '../api/client';
import './SearchPage.css';

const SearchPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const [inputValue, setInputValue] = useState(query);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Autocomplete state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [acResults, setAcResults] = useState(null);
  const [acLoading, setAcLoading] = useState(false);
  const [trending, setTrending] = useState([]);
  const debounceRef = useRef(null);
  const formRef = useRef(null);

  // Fetch trending on mount
  useEffect(() => {
    client.get('/search/trending')
      .then(res => setTrending(res.data.data || []))
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Sync input when URL query changes
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  // Run full search when URL query changes
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    const doSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.get(`/search?q=${encodeURIComponent(query)}&limit=8`);
        setResults(res.data.data);
      } catch (err) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.error?.message || err.message;
        console.error(`Search API error [${status}]:`, msg);
        setError(`${t('search.error')} (${status || 'network'}: ${msg})`);
      } finally {
        setLoading(false);
      }
    };

    doSearch();
  }, [query]);

  // Autocomplete as-you-type
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setDropdownOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 2) {
      setAcResults(null);
      setAcLoading(false);
      return;
    }

    setAcLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await client.get(`/search/autocomplete?q=${encodeURIComponent(val.trim())}`);
        setAcResults(res.data.data);
      } catch (_) {
        setAcResults(null);
      } finally {
        setAcLoading(false);
      }
    }, 250);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    setDropdownOpen(false);
    if (trimmed.length >= 2) {
      setSearchParams({ q: trimmed });
    }
  };

  const handleTrendingClick = (term) => {
    setInputValue(term);
    setDropdownOpen(false);
    setSearchParams({ q: term });
  };

  const handleAcItemClick = (path) => {
    setDropdownOpen(false);
    navigate(path);
  };

  const totalCount = results
    ? (results.resources?.length || 0) + (results.guides?.length || 0) + (results.articles?.length || 0)
    : 0;

  const acTotal = acResults
    ? (acResults.resources?.length || 0) + (acResults.guides?.length || 0) + (acResults.articles?.length || 0)
    : 0;

  return (
    <div className="search-page">
      <div className="search-page-header">
        <button className="search-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          {t('search.back')}
        </button>
        <h2 className="search-page-title">{t('search.title')}</h2>
      </div>

      <form className="search-page-form" onSubmit={handleSubmit} ref={formRef}>
        <div className="search-page-input-wrap">
          <Search size={18} className="search-page-icon" />
          <input
            className="search-page-input"
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setDropdownOpen(true)}
            placeholder={t('search.placeholder')}
            autoFocus
            autoComplete="off"
          />
          <button type="submit" className="search-page-btn">{t('search.searchBtn')}</button>
        </div>

        {/* Autocomplete dropdown */}
        {dropdownOpen && (
          <div className="search-page-dropdown">
            {inputValue.trim().length < 2 ? (
              // Show trending when empty
              trending.length > 0 ? (
                <>
                  <div className="search-drop-section-label">
                    <TrendingUp size={12} style={{ marginRight: 5 }} />
                    {t('search.trending')}
                  </div>
                  {trending.map((item, i) => (
                    <div
                      key={item.term}
                      className="search-drop-item"
                      onMouseDown={() => handleTrendingClick(item.term)}
                    >
                      <span className="drop-trending-rank">#{i + 1}</span>
                      <span style={{ flex: 1 }}>{item.term}</span>
                      {item.count > 0 && <span className="drop-tag">{item.count}</span>}
                    </div>
                  ))}
                </>
              ) : null
            ) : acLoading ? (
              <div className="search-drop-loading">{t('common.loading')}</div>
            ) : acTotal === 0 ? (
              <div className="search-drop-loading" style={{ color: 'var(--color-text-secondary)' }}>
                {t('search.noResults', { q: inputValue.trim() })}
              </div>
            ) : (
              <>
                {acResults?.resources?.map(r => (
                  <div key={`r-${r.id}`} className="search-drop-item"
                    onMouseDown={() => handleAcItemClick(`/resources/${r.id}`)}>
                    <Globe size={13} className="drop-icon" />
                    <span style={{ flex: 1 }}>{r.title}</span>
                    <span className="drop-tag">{t('nav.resources')}</span>
                  </div>
                ))}
                {acResults?.guides?.map(g => (
                  <div key={`g-${g.id}`} className="search-drop-item"
                    onMouseDown={() => handleAcItemClick(`/guides/${g.id}`)}>
                    <FileText size={13} className="drop-icon" />
                    <span style={{ flex: 1 }}>{g.title}</span>
                    <span className="drop-tag">{t('nav.guides')}</span>
                  </div>
                ))}
                {acResults?.articles?.map(a => (
                  <div key={`a-${a.id}`} className="search-drop-item"
                    onMouseDown={() => handleAcItemClick(`/knowledge/articles/${a.id}`)}>
                    <BookOpen size={13} className="drop-icon" />
                    <span style={{ flex: 1 }}>{a.title}</span>
                    <span className="drop-tag">{t('nav.knowledge')}</span>
                  </div>
                ))}
                <div
                  className="search-drop-viewall"
                  onMouseDown={handleSubmit}
                >
                  {t('search.viewAllResults')}
                </div>
              </>
            )}
          </div>
        )}
      </form>

      {loading && <div className="search-status">{t('common.loading')}</div>}
      {error && <div className="search-status search-error">{error}</div>}

      {!loading && results && (
        <>
          <p className="search-summary">
            {totalCount === 0
              ? t('search.noResults', { q: query })
              : t('search.foundResults', { count: totalCount, q: query })}
          </p>

          {results.resources?.length > 0 && (
            <section className="search-section">
              <h3 className="search-section-title">
                <Globe size={16} /> {t('nav.resources')}
              </h3>
              <div className="search-result-list">
                {results.resources.map(item => (
                  <div
                    key={item.id}
                    className="search-result-item"
                    onClick={() => navigate(`/resources/${item.id}`)}
                  >
                    <span className="result-title">{item.title}</span>
                    {item.description && (
                      <span className="result-desc">{item.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.guides?.length > 0 && (
            <section className="search-section">
              <h3 className="search-section-title">
                <FileText size={16} /> {t('nav.guides')}
              </h3>
              <div className="search-result-list">
                {results.guides.map(item => (
                  <div
                    key={item.id}
                    className="search-result-item"
                    onClick={() => navigate(`/guides/${item.id}`)}
                  >
                    <span className="result-title">{item.title}</span>
                    {item.description && (
                      <span className="result-desc">{item.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.articles?.length > 0 && (
            <section className="search-section">
              <h3 className="search-section-title">
                <BookOpen size={16} /> {t('nav.knowledge')}
              </h3>
              <div className="search-result-list">
                {results.articles.map(item => (
                  <div
                    key={item.id}
                    className="search-result-item"
                    onClick={() => navigate(`/knowledge/articles/${item.id}`)}
                  >
                    <span className="result-title">{item.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !results && !error && query.length < 2 && (
        <div className="search-status search-hint">
          {trending.length > 0 ? (
            <div className="search-trending-section">
              <div className="search-trending-title">
                <TrendingUp size={16} style={{ marginRight: 6, color: 'var(--color-primary)' }} />
                {t('search.trending')}
              </div>
              <div className="search-trending-list">
                {trending.map((item, i) => (
                  <button
                    key={item.term}
                    className="search-trending-chip"
                    onClick={() => handleTrendingClick(item.term)}
                  >
                    <span className="search-trending-chip-rank">#{i + 1}</span>
                    <span>{item.term}</span>
                    {item.count > 0 && <span className="search-trending-chip-count">{item.count} lượt</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            t('search.hint')
          )}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
