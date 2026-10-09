"""003_add_hostel_allocation

Revision ID: 7a9b1c34d5e6
Revises: 6c8e3a21b4d0
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a9b1c34d5e6'
down_revision: Union[str, None] = '6c8e3a21b4d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('hostels', schema=None) as batch_op:
        batch_op.add_column(sa.Column('allocation', sa.String(length=20), server_default='Boys', nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hostels', schema=None) as batch_op:
        batch_op.drop_column('allocation')
