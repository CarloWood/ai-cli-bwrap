""" See https://claude.ai/share/a889807e-4394-4933-b1f3-91304dfbb041 """

import gdb

class BacktraceStopAt(gdb.Parameter):
    """Function name after which 'backtrace' stops printing frames."""
    set_doc = "Set the function at which backtraces stop."
    show_doc = "Show the function at which backtraces stop."

    def __init__(self):
        super().__init__("backtrace stop-at", gdb.COMMAND_STACK, gdb.PARAM_STRING)
        self.value = ""

    def get_show_string(self, svalue):
        return f'Backtraces stop at "{svalue}".' if svalue else "Backtraces are not truncated."

stop_at = BacktraceStopAt()

class StopAtFrameFilter:
    def __init__(self):
        self.name = "stop-at"
        self.priority = 0        # low priority: runs after other filters
        self.enabled = True
        gdb.frame_filters[self.name] = self

    def filter(self, frame_iter):
        target = stop_at.value
        for fd in frame_iter:
            yield fd
            if target and str(fd.function()) == target:
                return           # stop the backtrace here

StopAtFrameFilter()
