// src/utils/validateEmbarkId.js
export const validateEmbarkId = (id) => {
  const pattern = /^.+#\d{4}$/;
  return pattern.test(id);
};