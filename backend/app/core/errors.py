from dataclasses import dataclass


@dataclass
class AppError(Exception):
    code: str
    status_code: int
    message: str
