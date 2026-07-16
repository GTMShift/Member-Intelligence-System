// Email format check
const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  
  // Date format check (YYYY-MM-DD)
  const isValidDate = (date) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  };
  
  // LinkedIn URL check
  const isValidLinkedIn = (url) => {
    return /^https:\/\/(www\.)?linkedin\.com\/in\//.test(url);
  };
  
  // Enum check
  const isValidEnum = (value, allowed) => {
    return allowed.includes(value);
  };

  const EMPLOYMENT_SOURCES = ['Apollo', 'Manual', 'Import', 'FullEnrich'];

  const isValidEmploymentSource = (source) => {
    return isValidEnum(source, EMPLOYMENT_SOURCES);
  };
  
  module.exports = {
    isValidEmail,
    isValidDate,
    isValidLinkedIn,
    isValidEnum,
    EMPLOYMENT_SOURCES,
    isValidEmploymentSource,
  };