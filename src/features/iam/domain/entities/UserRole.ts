/**
 * Role & Permission Group Domain Entities
 *
 * Enforces Role -> Permission Group -> Permission hierarchy.
 */

export interface Permission {
  permissionId: string;
  resource: string;
  action: string;
  description: string;
}

export interface PermissionGroup {
  groupId: string;
  groupName: string;
  permissions: Permission[];
}

export interface UserRoleProps {
  roleId: string;
  roleName: string;
  description: string;
  permissionGroups: PermissionGroup[];
  isSystemRole: boolean;
}

export class UserRole {
  constructor(private readonly props: UserRoleProps) {}

  public get roleId(): string {
    return this.props.roleId;
  }

  public get roleName(): string {
    return this.props.roleName;
  }

  public getPermissions(): Permission[] {
    const allPermissions: Permission[] = [];
    for (const group of this.props.permissionGroups) {
      allPermissions.push(...group.permissions);
    }
    return allPermissions;
  }

  public hasPermission(permissionId: string): boolean {
    return this.getPermissions().some((p) => p.permissionId === permissionId);
  }
}
