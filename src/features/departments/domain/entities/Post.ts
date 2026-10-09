/**
 * Post / Designation Domain Entity
 *
 * Defines official government posts (e.g. Junior Engineer, Assistant Engineer, Nodal Officer)
 * and associated role policies.
 */

export type PostStatus = 'Active' | 'Frozen' | 'Deprecated';

export interface PostProps {
  postId: string;
  sectorId: string;
  departmentId: string;
  code: string;
  name: string;
  description: string;
  rolePolicy: string;
  permissionPolicy: string[];
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Post {
  constructor(private readonly props: PostProps) {}

  public get postId(): string {
    return this.props.postId;
  }

  public get departmentId(): string {
    return this.props.departmentId;
  }

  public get name(): string {
    return this.props.name;
  }

  public get rolePolicy(): string {
    return this.props.rolePolicy;
  }

  public toJSON(): PostProps {
    return { ...this.props };
  }
}
