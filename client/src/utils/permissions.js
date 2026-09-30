export const ROLE_PERMISSIONS = {
  viewer: ['viewer'],
  admin: ['admin', 'viewer'],
};

export const canAccess = (userRole, allowedRoles = []) => {
  if (!userRole || !allowedRoles.length) return true;
  return allowedRoles.includes(userRole);
};
