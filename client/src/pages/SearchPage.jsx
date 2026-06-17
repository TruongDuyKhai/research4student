import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, BookOpen, FileText, Globe, ArrowLeft } from 'lucide-react';
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

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    // Track search term in localStorage
    try {
      const stored = JSON.parse(localStorage.getItem('r4s_searches') || '[]');
      const existing = stored.find(s => s.term.toLowerCase() === query.toLowerCase());
      let updated;
      if (existing) {
        updated = stored.map(s =>
          s.term.toLowerCase() === query.toLowerCase()
            ? { ...s, count: s.count + 1 }
            : s
        );
      } else {
        updated = [{ term: query, count: 1 }, ...stored];
      }
      // Keep top 50
      localStorage.setItem('r4s_searches', JSON.stringify(updated.slice(0, 50)));
    } catch (_) {}

    const doSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await client.get(`/search?q=${encodeURIComponent(query)}&limit=8`);
        setResults(res.data.data);
      } catch (err) {
        setError(t('search.error'));
      } finally {
        setLoading(false);
      }
    };

    doSearch();
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed.length >= 2) {
      setSearchParams({ q: trimmed });
    }
  };

  const totalCount = results
    ? (results.resources?.length || 0) + (results.guides?.length || 0) + (results.articles?.length || 0)
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

      <form className="search-page-form" onSubmit={handleSubmit}>
        <div className="search-page-input-wrap">
          <Search size={18} className="search-page-icon" />
          <input
            className="search-page-input"
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={t('search.placeholder')}
            autoFocus
          />
          <button type="submit" className="search-page-btn">{t('search.searchBtn')}</button>
        </div>
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
        <div className="search-status search-hint">{t('search.hint')}</div>
      )}
    </div>
  );
};

export default SearchPage;
