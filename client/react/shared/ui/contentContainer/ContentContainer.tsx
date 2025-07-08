import { ReactElement } from 'react';

import { Box } from '@mui/material';

interface IContentContainer {
  children: ReactElement;
}

const ContentContainer = ({ children }: IContentContainer) => {
  return (
    <Box
      sx={{
        width: '144rem',
        height: '100%',
        margin: '0 auto',
      }}
    >
      {children}
    </Box>
  );
};

export default ContentContainer;
