"""002_add_university_reg_and_accommodation

Revision ID: 6c8e3a21b4d0
Revises: 5b7d1904cef7
Create Date: 2026-10-09 19:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c8e3a21b4d0'
down_revision: Union[str, None] = '5b7d1904cef7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.add_column(sa.Column('university_reg_number', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('accommodation_type', sa.String(length=20), server_default='DAY_SCHOLAR', nullable=False))
        batch_op.add_column(sa.Column('hostel_block', sa.String(length=20), nullable=True))
        batch_op.create_index(batch_op.f('ix_students_university_reg_number'), ['university_reg_number'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_students_university_reg_number'))
        batch_op.drop_column('hostel_block')
        batch_op.drop_column('accommodation_type')
        batch_op.drop_column('university_reg_number')
