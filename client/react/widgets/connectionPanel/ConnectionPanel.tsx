import { Box } from '@mui/material';

import ConnectionSection from './ConnectionSection';

const ConnectionPanel = () => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <ConnectionSection title="Listening Interface" />
      <ConnectionSection title="Server Interface" />
    </Box>
  );
};

export default ConnectionPanel;
