CREATE TABLE `rolePermission` (
  `action` text NOT NULL,
  `roleId` text NOT NULL,
  PRIMARY KEY (`action`, `roleId`)
);
